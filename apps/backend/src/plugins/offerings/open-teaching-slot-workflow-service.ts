import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  OpenTeachingSlotClaimReviewResult,
  OpenTeachingSlotClaimView,
  OpenTeachingSlotStudentAssignment,
  OpenTeachingSlotStatus,
  ReviewOpenTeachingSlotClaim,
  SubmitOpenTeachingSlotClaim,
} from "@dse-pms/shared-types";
import type { AuthUser } from "../../core/auth/token.ts";
import { hasAnyRoleInProgramme } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import {
  OpenTeachingSlotAuthorizationError,
  OpenTeachingSlotConflictError,
  OpenTeachingSlotNotFoundError,
  openTeachingSlotService,
} from "./open-teaching-slot-service.ts";

const REVIEW_ROLES = ["admin", "program_coordinator"] as const;
const CAMBODIA_OFFSET = "+07:00";

type SlotLifecycleRow = {
  slotId: string;
  slotStatus: OpenTeachingSlotStatus;
  claimId: string | null;
  claimStatus: "REQUESTED" | "APPROVED" | "REJECTED" | "WITHDRAWN" | null;
  claimantId: string | null;
  programmeId: string;
  sessionDate: Date;
  scheduledEndTime: string;
};

type TelegramOpenSlotWorkflowService = {
  notifications: {
    workflowUrl(path: string): string;
  };
  openTeachingSlots: {
    deliverClaimant(input: {
      claimId: string;
      userId: string;
      status: "APPROVED" | "REJECTED";
      courseCode: string;
      courseTitle: string;
      sectionCode: string;
      sessionDate: string;
      startTime: string;
      endTime: string;
      room: string | null;
    }): Promise<"sent" | "missing" | "failed" | "duplicate">;
    deliverStudents(
      assignment: OpenTeachingSlotStudentAssignment,
    ): Promise<{ sent: number; failed: number; duplicate: number; missing: number }>;
  };
  destinations: {
    deliverToAudience(input: {
      programmeId: string;
      audienceType: "ALL_LECTURERS";
      eventKey: string;
      kind: string;
      resourceId: string;
      text: string;
      url: string;
    }): Promise<{ status: "sent" | "missing" | "failed" | "duplicate"; error?: string }>;
  };
};

function telegram() {
  return registry.get<TelegramOpenSlotWorkflowService>("telegram").service;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isExpired(date: Date, endTime: string, now = new Date()): boolean {
  return new Date(`${dateOnly(date)}T${endTime}:00${CAMBODIA_OFFSET}`).getTime() <= now.getTime();
}

function isManager(user: AuthUser, programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, [...REVIEW_ROLES], programmeId);
}

async function lifecycleForSlot(
  tx: Prisma.TransactionClient,
  slotId: string,
  lock = false,
): Promise<SlotLifecycleRow | null> {
  const suffix = lock ? "FOR UPDATE OF slot" : "";
  const rows = await tx.$queryRawUnsafe<SlotLifecycleRow[]>(
    `
      SELECT slot."id" AS "slotId", slot."status" AS "slotStatus",
             NULL::text AS "claimId", NULL::text AS "claimStatus", NULL::text AS "claimantId",
             slot."programmeId", occurrence."sessionDate", occurrence."scheduledEndTime"
      FROM "pms_attendance"."OpenTeachingSlot" slot
      JOIN "pms_attendance"."TeachingSessionOccurrence" occurrence
        ON occurrence."id" = slot."sourceOccurrenceId"
      WHERE slot."id" = $1
      ${suffix}
    `,
    slotId,
  );
  return rows[0] ?? null;
}

async function lifecycleForClaim(
  tx: Prisma.TransactionClient,
  claimId: string,
  lock = false,
): Promise<SlotLifecycleRow | null> {
  const suffix = lock ? "FOR UPDATE OF claim, slot" : "";
  const rows = await tx.$queryRawUnsafe<SlotLifecycleRow[]>(
    `
      SELECT slot."id" AS "slotId", slot."status" AS "slotStatus",
             claim."id" AS "claimId", claim."status" AS "claimStatus", claim."claimantId",
             slot."programmeId", occurrence."sessionDate", occurrence."scheduledEndTime"
      FROM "pms_attendance"."OpenTeachingSlotClaim" claim
      JOIN "pms_attendance"."OpenTeachingSlot" slot ON slot."id" = claim."slotId"
      JOIN "pms_attendance"."TeachingSessionOccurrence" occurrence
        ON occurrence."id" = slot."sourceOccurrenceId"
      WHERE claim."id" = $1
      ${suffix}
    `,
    claimId,
  );
  return rows[0] ?? null;
}

async function appendSlotAudit(
  tx: Prisma.TransactionClient,
  input: {
    slotId: string;
    claimId?: string | null;
    actorId: string;
    action: "EXPIRED" | "WITHDRAWN" | "REJECTED";
    previousStatus: OpenTeachingSlotStatus;
    newStatus: OpenTeachingSlotStatus;
    details?: Record<string, unknown>;
  },
) {
  await tx.$executeRaw`
    INSERT INTO "pms_attendance"."OpenTeachingSlotAuditEvent"
      ("id","slotId","claimId","actorId","action","previousStatus","newStatus","details")
    VALUES (
      ${randomUUID()},${input.slotId},${input.claimId ?? null},${input.actorId},${input.action},
      ${input.previousStatus},${input.newStatus},${input.details ? JSON.stringify(input.details) : null}::jsonb
    )
  `;
}

async function expireOpenSlotBeforeClaim(user: AuthUser, slotId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const slot = await lifecycleForSlot(tx, slotId, true);
    if (!slot || slot.slotStatus !== "OPEN" || !isExpired(slot.sessionDate, slot.scheduledEndTime)) {
      return false;
    }
    await tx.$executeRaw`
      UPDATE "pms_attendance"."OpenTeachingSlot"
      SET "status"='EXPIRED', "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${slot.slotId}
    `;
    await appendSlotAudit(tx, {
      slotId: slot.slotId,
      actorId: user.id,
      action: "EXPIRED",
      previousStatus: slot.slotStatus,
      newStatus: "EXPIRED",
      details: { reason: "slot-ended-before-claim" },
    });
    return true;
  });
}

async function withdrawExpiredClaim(
  user: AuthUser,
  claimId: string,
): Promise<OpenTeachingSlotClaimView | null> {
  const changed = await prisma.$transaction(async (tx) => {
    const lifecycle = await lifecycleForClaim(tx, claimId, true);
    if (!lifecycle) return false;
    if (lifecycle.claimantId !== user.id) {
      throw new OpenTeachingSlotAuthorizationError("Only the claimant can withdraw this request");
    }
    if (lifecycle.claimStatus !== "REQUESTED") return false;
    const expired = lifecycle.slotStatus === "EXPIRED" || isExpired(lifecycle.sessionDate, lifecycle.scheduledEndTime);
    if (!expired) return false;

    await tx.$executeRaw`
      UPDATE "pms_attendance"."OpenTeachingSlotClaim"
      SET "status"='WITHDRAWN', "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${claimId}
    `;
    await tx.$executeRaw`
      UPDATE "pms_attendance"."OpenTeachingSlot"
      SET "status"='EXPIRED', "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${lifecycle.slotId}
    `;
    await appendSlotAudit(tx, {
      slotId: lifecycle.slotId,
      claimId,
      actorId: user.id,
      action: "WITHDRAWN",
      previousStatus: lifecycle.slotStatus,
      newStatus: "EXPIRED",
      details: { expired: true },
    });
    return true;
  });

  if (!changed) return null;
  const mine = await openTeachingSlotService.mine(user);
  return mine.find((claim) => claim.id === claimId) ?? null;
}

async function finalizeExpiredReview(
  user: AuthUser,
  claimId: string,
  input: ReviewOpenTeachingSlotClaim,
): Promise<"expired-approval" | "rejected" | null> {
  return prisma.$transaction(async (tx) => {
    const lifecycle = await lifecycleForClaim(tx, claimId, true);
    if (!lifecycle) throw new OpenTeachingSlotNotFoundError("Open teaching slot claim not found");
    if (!isManager(user, lifecycle.programmeId)) {
      throw new OpenTeachingSlotAuthorizationError("Only a programme administrator or coordinator can review this claim");
    }
    if (lifecycle.claimantId === user.id) {
      throw new OpenTeachingSlotAuthorizationError("A lecturer cannot review their own open teaching slot claim");
    }
    if (lifecycle.claimStatus !== "REQUESTED") return null;
    const expired = lifecycle.slotStatus === "EXPIRED" || isExpired(lifecycle.sessionDate, lifecycle.scheduledEndTime);
    if (!expired) return null;

    if (input.decision === "APPROVE") {
      if (lifecycle.slotStatus !== "EXPIRED") {
        await tx.$executeRaw`
          UPDATE "pms_attendance"."OpenTeachingSlot"
          SET "status"='EXPIRED', "updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${lifecycle.slotId}
        `;
        await appendSlotAudit(tx, {
          slotId: lifecycle.slotId,
          claimId,
          actorId: user.id,
          action: "EXPIRED",
          previousStatus: lifecycle.slotStatus,
          newStatus: "EXPIRED",
          details: { reason: "slot-ended-before-review" },
        });
      }
      return "expired-approval";
    }

    await tx.$executeRaw`
      UPDATE "pms_attendance"."OpenTeachingSlotClaim"
      SET "status"='REJECTED', "reviewedById"=${user.id}, "reviewedAt"=CURRENT_TIMESTAMP,
          "reviewComment"=${input.comment ?? ""}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${claimId}
    `;
    await tx.$executeRaw`
      UPDATE "pms_attendance"."OpenTeachingSlot"
      SET "status"='EXPIRED', "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${lifecycle.slotId}
    `;
    await appendSlotAudit(tx, {
      slotId: lifecycle.slotId,
      claimId,
      actorId: user.id,
      action: "REJECTED",
      previousStatus: lifecycle.slotStatus,
      newStatus: "EXPIRED",
      details: { expired: true, comment: input.comment ?? "" },
    });
    return "rejected";
  });
}

async function confirmedAssignment(
  claimId: string,
): Promise<{ programmeId: string; assignment: OpenTeachingSlotStudentAssignment } | null> {
  const rows = await prisma.$queryRaw<Array<{
    programmeId: string;
    occurrenceId: string;
    slotId: string;
    offeringId: string;
    courseCode: string;
    courseTitle: string;
    sectionCode: string;
    lecturerName: string;
    sessionDate: Date;
    startTime: string;
    endTime: string;
    room: string | null;
    activityType: string;
  }>>`
    SELECT slot."programmeId", occurrence."id" AS "occurrenceId", claim."slotId",
           occurrence."offeringId", course."code" AS "courseCode", course."title" AS "courseTitle",
           offering."sectionCode", claimant."name" AS "lecturerName", occurrence."sessionDate",
           occurrence."scheduledStartTime" AS "startTime", occurrence."scheduledEndTime" AS "endTime",
           occurrence."scheduledRoom" AS "room", occurrence."scheduledActivityType" AS "activityType"
    FROM "pms_attendance"."OpenTeachingSlotClaim" claim
    JOIN "pms_attendance"."OpenTeachingSlot" slot ON slot."id" = claim."slotId"
    JOIN "pms_attendance"."TeachingSessionOccurrence" occurrence
      ON occurrence."id" = claim."confirmedOccurrenceId"
    JOIN "Offering" offering ON offering."id" = occurrence."offeringId"
    JOIN "Course" course ON course."id" = offering."courseId"
    JOIN "User" claimant ON claimant."id" = claim."claimantId"
    WHERE claim."id"=${claimId} AND claim."status"='APPROVED'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    programmeId: row.programmeId,
    assignment: {
      occurrenceId: row.occurrenceId,
      slotId: row.slotId,
      offeringId: row.offeringId,
      courseCode: row.courseCode,
      courseTitle: row.courseTitle,
      sectionCode: row.sectionCode,
      lecturerName: row.lecturerName,
      sessionDate: dateOnly(row.sessionDate),
      startTime: row.startTime,
      endTime: row.endTime,
      room: row.room,
      activityType: row.activityType,
      kind: "reused-slot",
    },
  };
}

async function notifyReviewResult(claim: OpenTeachingSlotClaimView): Promise<void> {
  if (claim.status !== "APPROVED" && claim.status !== "REJECTED") return;
  try {
    const service = telegram();
    await service.openTeachingSlots.deliverClaimant({
      claimId: claim.id,
      userId: claim.claimant.id,
      status: claim.status,
      courseCode: claim.targetOffering.courseCode,
      courseTitle: claim.targetOffering.courseTitle,
      sectionCode: claim.targetOffering.sectionCode,
      sessionDate: claim.slot.sessionDate,
      startTime: claim.slot.startTime,
      endTime: claim.slot.endTime,
      room: claim.slot.room,
    });

    if (claim.status !== "APPROVED") return;
    const confirmed = await confirmedAssignment(claim.id);
    if (!confirmed) return;
    await Promise.allSettled([
      service.openTeachingSlots.deliverStudents(confirmed.assignment),
      service.destinations.deliverToAudience({
        programmeId: confirmed.programmeId,
        audienceType: "ALL_LECTURERS",
        eventKey: `open-teaching-slot:${claim.id}:${confirmed.assignment.occurrenceId}:all-lecturers`,
        kind: "open_teaching_slot_assigned",
        resourceId: claim.id,
        text: [
          "Open teaching slot assigned",
          "",
          `${confirmed.assignment.courseCode} · ${confirmed.assignment.courseTitle} · Class ${confirmed.assignment.sectionCode}`,
          `Lecturer: ${confirmed.assignment.lecturerName}`,
          `${confirmed.assignment.sessionDate} · ${confirmed.assignment.startTime}–${confirmed.assignment.endTime}`,
          confirmed.assignment.room ? `Room: ${confirmed.assignment.room}` : "Room: not set",
          "This confirmed class belongs to the assigned course. The original leave-affected course remains outstanding until separately recovered.",
        ].join("\n"),
        url: service.notifications.workflowUrl("/telegram/schedule"),
      }),
    ]);
  } catch (error) {
    console.error("Open teaching slot notification delivery failed", error);
  }
}

export const openTeachingSlotWorkflowService = {
  ...openTeachingSlotService,

  async claim(user: AuthUser, slotId: string, input: SubmitOpenTeachingSlotClaim) {
    if (await expireOpenSlotBeforeClaim(user, slotId)) {
      throw new OpenTeachingSlotConflictError("This teaching slot has already ended");
    }
    return openTeachingSlotService.claim(user, slotId, input);
  },

  async withdraw(user: AuthUser, claimId: string) {
    const expiredResult = await withdrawExpiredClaim(user, claimId);
    if (expiredResult) return expiredResult;
    return openTeachingSlotService.withdraw(user, claimId);
  },

  async review(
    user: AuthUser,
    claimId: string,
    input: ReviewOpenTeachingSlotClaim,
  ): Promise<OpenTeachingSlotClaimReviewResult> {
    const expiredReview = await finalizeExpiredReview(user, claimId, input);
    if (expiredReview === "expired-approval") {
      throw new OpenTeachingSlotConflictError("This released teaching slot has already ended");
    }

    const result = await openTeachingSlotService.review(user, claimId, input);
    const normalized = expiredReview === "rejected"
      ? { ...result, changed: true }
      : result;
    await notifyReviewResult(normalized.claim);
    return normalized;
  },
};
