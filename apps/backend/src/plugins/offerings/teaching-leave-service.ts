import { randomUUID } from "node:crypto";
import type {
  ReviseTeachingLeaveRequest,
  SubmitTeachingLeaveRequest,
  TeachingLeaveOperationalImpact,
  TeachingLeaveRequestView,
  TeachingLeaveReviewResult,
  TeachingLeaveStatus,
  ReviewTeachingLeaveRequest,
} from "@dse-pms/shared-types";
import type { AuthUser } from "../../core/auth/token.ts";
import { hasAnyRoleInProgramme } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { classDeliveryService } from "./class-delivery-service.ts";

const REVIEW_ROLES = ["admin", "program_coordinator"] as const;
const DEFAULT_NOTICE_HOURS = 24;
const CAMBODIA_OFFSET = "+07:00";

export class TeachingLeaveNotFoundError extends Error {}
export class TeachingLeaveAuthorizationError extends Error {}
export class TeachingLeaveValidationError extends Error {}
export class TeachingLeaveConflictError extends Error {}

type LeaveRow = {
  id: string;
  programmeId: string;
  requesterId: string;
  requesterName: string;
  leaveType: TeachingLeaveRequestView["leaveType"];
  confidentialReason: string;
  attachmentRef: string | null;
  proposedHandling: TeachingLeaveRequestView["proposedHandling"];
  proposedNote: string;
  noticeHours: number;
  submittedLate: boolean;
  status: TeachingLeaveStatus;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewComment: string;
  submittedAt: Date;
  updatedAt: Date;
};

type LeaveOccurrenceRow = {
  occurrenceId: string;
  offeringId: string;
  offeringMeetingId: string;
  sessionDate: Date;
  scheduledDayOfWeek: TeachingLeaveRequestView["occurrences"][number]["scheduledDayOfWeek"];
  scheduledStartTime: string;
  scheduledEndTime: string;
  scheduledRoom: string | null;
  scheduledActivityType: TeachingLeaveRequestView["occurrences"][number]["scheduledActivityType"];
  releaseForReuse: boolean;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
};

type TelegramWorkflowService = {
  notifications: {
    deliverTeachingLeaveRequester(input: {
      requestId: string;
      userId: string;
      status: TeachingLeaveStatus;
      firstOccurrence: TeachingLeaveOperationalImpact;
    }): Promise<"sent" | "missing" | "failed" | "duplicate">;
    deliverTeachingLeaveStudents(input: TeachingLeaveOperationalImpact): Promise<{
      sent: number;
      failed: number;
      duplicate: number;
      missing: number;
    }>;
    workflowUrl(path: string): string;
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

const telegram = () => registry.get<TelegramWorkflowService>("telegram").service;

function noticeHours(): number {
  const raw = process.env.TEACHING_LEAVE_NOTICE_HOURS?.trim();
  if (!raw) return DEFAULT_NOTICE_HOURS;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 && value <= 720 ? value : DEFAULT_NOTICE_HOURS;
}

export function scheduledInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${CAMBODIA_OFFSET}`);
}

export function isTeachingLeaveLate(date: string, startTime: string, hours: number, now = new Date()): boolean {
  return scheduledInstant(date, startTime).getTime() - now.getTime() < hours * 60 * 60 * 1000;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isManager(user: AuthUser, programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, [...REVIEW_ROLES], programmeId);
}

async function requestRowsByIds(ids: string[]): Promise<LeaveRow[]> {
  if (ids.length === 0) return [];
  return prisma.$queryRawUnsafe<LeaveRow[]>(
    `
      SELECT r.*, requester."name" AS "requesterName",
             reviewer."name" AS "reviewedByName"
      FROM "pms_attendance"."TeachingLeaveRequest" r
      JOIN "User" requester ON requester."id" = r."requesterId"
      LEFT JOIN "User" reviewer ON reviewer."id" = r."reviewedById"
      WHERE r."id" = ANY($1::text[])
      ORDER BY r."submittedAt" DESC, r."id" DESC
    `,
    ids,
  );
}

async function occurrenceRows(requestId: string): Promise<LeaveOccurrenceRow[]> {
  return prisma.$queryRaw<LeaveOccurrenceRow[]>`
    SELECT link."occurrenceId", link."releaseForReuse",
           occ."offeringId", occ."offeringMeetingId", occ."sessionDate",
           occ."scheduledDayOfWeek", occ."scheduledStartTime", occ."scheduledEndTime",
           occ."scheduledRoom", occ."scheduledActivityType",
           c."code" AS "courseCode", c."title" AS "courseTitle", o."sectionCode"
    FROM "pms_attendance"."TeachingLeaveRequestOccurrence" link
    JOIN "pms_attendance"."TeachingSessionOccurrence" occ ON occ."id" = link."occurrenceId"
    JOIN "Offering" o ON o."id" = occ."offeringId"
    JOIN "Course" c ON c."id" = o."courseId"
    WHERE link."requestId" = ${requestId}
    ORDER BY occ."sessionDate", occ."scheduledStartTime", occ."id"
  `;
}

async function toView(row: LeaveRow): Promise<TeachingLeaveRequestView> {
  const occurrences = await occurrenceRows(row.id);
  return {
    id: row.id,
    programmeId: row.programmeId,
    requester: { id: row.requesterId, name: row.requesterName },
    leaveType: row.leaveType,
    confidentialReason: row.confidentialReason,
    attachmentRef: row.attachmentRef,
    proposedHandling: row.proposedHandling,
    proposedNote: row.proposedNote,
    noticeHours: row.noticeHours,
    submittedLate: row.submittedLate,
    status: row.status,
    reviewedBy: row.reviewedById && row.reviewedByName ? { id: row.reviewedById, name: row.reviewedByName } : null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewComment: row.reviewComment,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    occurrences: occurrences.map((item) => ({
      occurrenceId: item.occurrenceId,
      offeringId: item.offeringId,
      offeringMeetingId: item.offeringMeetingId,
      sessionDate: dateOnly(item.sessionDate),
      scheduledDayOfWeek: item.scheduledDayOfWeek,
      scheduledStartTime: item.scheduledStartTime,
      scheduledEndTime: item.scheduledEndTime,
      scheduledRoom: item.scheduledRoom,
      scheduledActivityType: item.scheduledActivityType,
      releaseForReuse: item.releaseForReuse,
      course: { code: item.courseCode, title: item.courseTitle },
      sectionCode: item.sectionCode,
    })),
  };
}

async function readRequest(id: string): Promise<TeachingLeaveRequestView> {
  const rows = await requestRowsByIds([id]);
  if (!rows[0]) throw new TeachingLeaveNotFoundError("Teaching leave request not found");
  return toView(rows[0]);
}

function impactFor(request: TeachingLeaveRequestView, occurrence: TeachingLeaveRequestView["occurrences"][number]): TeachingLeaveOperationalImpact {
  return {
    requestId: request.id,
    occurrenceId: occurrence.occurrenceId,
    offeringId: occurrence.offeringId,
    programmeId: request.programmeId,
    courseCode: occurrence.course.code,
    courseTitle: occurrence.course.title,
    sectionCode: occurrence.sectionCode,
    sessionDate: occurrence.sessionDate,
    startTime: occurrence.scheduledStartTime,
    endTime: occurrence.scheduledEndTime,
    room: occurrence.scheduledRoom,
    releaseForReuse: occurrence.releaseForReuse,
    proposedHandling: request.proposedHandling,
  };
}

async function requesterNotification(request: TeachingLeaveRequestView) {
  const first = request.occurrences[0];
  if (!first) return "missing" as const;
  try {
    return await telegram().notifications.deliverTeachingLeaveRequester({
      requestId: request.id,
      userId: request.requester.id,
      status: request.status,
      firstOccurrence: impactFor(request, first),
    });
  } catch {
    return "failed" as const;
  }
}

async function approvedNotifications(request: TeachingLeaveRequestView): Promise<TeachingLeaveReviewResult["notifications"]> {
  const requester = await requesterNotification(request);
  const studentTotals = { sent: 0, failed: 0, duplicate: 0, missing: 0 };
  const lecturerGroup: TeachingLeaveReviewResult["notifications"]["lecturerGroup"] = [];

  for (const occurrence of request.occurrences) {
    const impact = impactFor(request, occurrence);
    try {
      const result = await telegram().notifications.deliverTeachingLeaveStudents(impact);
      studentTotals.sent += result.sent;
      studentTotals.failed += result.failed;
      studentTotals.duplicate += result.duplicate;
      studentTotals.missing += result.missing;
    } catch {
      studentTotals.failed += 1;
    }

    if (!occurrence.releaseForReuse) continue;
    let status: "sent" | "missing" | "failed" | "duplicate" = "failed";
    try {
      const link = telegram().notifications.workflowUrl(`/telegram/schedule?occurrenceId=${encodeURIComponent(occurrence.occurrenceId)}`);
      const group = await telegram().destinations.deliverToAudience({
        programmeId: request.programmeId,
        audienceType: "ALL_LECTURERS",
        eventKey: `teaching-slot-open:${request.id}:${occurrence.occurrenceId}`,
        kind: "teaching_slot_open",
        resourceId: request.id,
        text: [
          "Open Teaching Slot",
          "",
          `${occurrence.course.code} · Class ${occurrence.sectionCode}`,
          `${occurrence.sessionDate} · ${occurrence.scheduledStartTime}–${occurrence.scheduledEndTime}`,
          occurrence.scheduledRoom ? `Room: ${occurrence.scheduledRoom}` : "Room: not set",
          "This period may be reused by an eligible lecturer for their own assigned course. The original course remains to be recovered separately.",
        ].join("\n"),
        url: link,
      });
      status = group.status;
    } catch {
      status = "failed";
    }
    lecturerGroup.push({ occurrenceId: occurrence.occurrenceId, status });
  }

  return { requester, students: studentTotals, lecturerGroup };
}

export const teachingLeaveService = {
  async submit(user: AuthUser, input: SubmitTeachingLeaveRequest): Promise<TeachingLeaveRequestView> {
    const resolved: Array<{
      occurrenceId: string;
      offeringId: string;
      programmeId: string;
      releaseForReuse: boolean;
      sessionDate: string;
      startTime: string;
      endTime: string;
    }> = [];

    for (const requested of input.occurrences) {
      const offering = await prisma.offering.findUnique({
        where: { id: requested.offeringId },
        select: {
          lecturerId: true,
          sectionCode: true,
          course: { select: { programmeId: true } },
          coLecturers: { select: { lecturerId: true } },
          meetings: { where: { id: requested.offeringMeetingId }, select: { id: true } },
        },
      });
      if (!offering || offering.meetings.length !== 1) {
        throw new TeachingLeaveNotFoundError("The selected teaching session is no longer in the current timetable");
      }
      const assigned = offering.lecturerId === user.id || offering.coLecturers.some((item) => item.lecturerId === user.id);
      if (!assigned) throw new TeachingLeaveAuthorizationError("You can request teaching leave only for your own assigned sessions");

      const occurrence = await classDeliveryService.resolveTeachingSessionOccurrence(
        requested.offeringId,
        requested.offeringMeetingId,
        requested.date,
      );
      if (scheduledInstant(occurrence.sessionDate, occurrence.scheduledEndTime).getTime() <= Date.now()) {
        throw new TeachingLeaveValidationError("Teaching leave can be requested only for a current or future session");
      }
      resolved.push({
        occurrenceId: occurrence.id,
        offeringId: occurrence.offeringId,
        programmeId: offering.course.programmeId,
        releaseForReuse: requested.releaseForReuse,
        sessionDate: occurrence.sessionDate,
        startTime: occurrence.scheduledStartTime,
        endTime: occurrence.scheduledEndTime,
      });
    }

    const programmes = new Set(resolved.map((item) => item.programmeId));
    if (programmes.size !== 1) throw new TeachingLeaveValidationError("One leave request cannot span multiple programmes");
    const programmeId = resolved[0]!.programmeId;
    const hours = noticeHours();
    const submittedLate = resolved.some((item) => isTeachingLeaveLate(item.sessionDate, item.startTime, hours));
    const requestId = randomUUID();

    await prisma.$transaction(async (tx) => {
      for (const item of resolved) {
        const duplicate = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT r."id"
          FROM "pms_attendance"."TeachingLeaveRequestOccurrence" link
          JOIN "pms_attendance"."TeachingLeaveRequest" r ON r."id" = link."requestId"
          WHERE link."occurrenceId" = ${item.occurrenceId}
            AND r."requesterId" = ${user.id}
            AND r."status" IN ('PENDING','CHANGES_REQUESTED','APPROVED')
          LIMIT 1
          FOR UPDATE OF r
        `;
        if (duplicate[0]) throw new TeachingLeaveConflictError("You already have an active leave request for one of these sessions");
      }

      await tx.$executeRaw`
        INSERT INTO "pms_attendance"."TeachingLeaveRequest" (
          "id","programmeId","requesterId","leaveType","confidentialReason","attachmentRef",
          "proposedHandling","proposedNote","noticeHours","submittedLate","status"
        ) VALUES (
          ${requestId},${programmeId},${user.id},${input.leaveType},${input.confidentialReason},${input.attachmentRef ?? null},
          ${input.proposedHandling},${input.proposedNote ?? ""},${hours},${submittedLate},'PENDING'
        )
      `;
      for (const item of resolved) {
        await tx.$executeRaw`
          INSERT INTO "pms_attendance"."TeachingLeaveRequestOccurrence" ("requestId","occurrenceId","releaseForReuse")
          VALUES (${requestId},${item.occurrenceId},${item.releaseForReuse})
        `;
      }
      await tx.$executeRaw`
        INSERT INTO "pms_attendance"."TeachingLeaveAuditEvent"
          ("id","requestId","actorId","action","newStatus","details")
        VALUES (
          ${randomUUID()},${requestId},${user.id},'SUBMITTED','PENDING',
          ${JSON.stringify({ occurrenceIds: resolved.map((item) => item.occurrenceId), leaveType: input.leaveType, proposedHandling: input.proposedHandling, submittedLate })}::jsonb
        )
      `;
    });

    const request = await readRequest(requestId);
    void requesterNotification(request);
    return request;
  },

  async revise(user: AuthUser, id: string, input: ReviseTeachingLeaveRequest): Promise<TeachingLeaveRequestView> {
    const before = await readRequest(id);
    if (before.requester.id !== user.id) {
      throw new TeachingLeaveAuthorizationError("Only the requesting lecturer can revise this teaching leave request");
    }
    if (before.status !== "CHANGES_REQUESTED") {
      throw new TeachingLeaveConflictError("Teaching leave can be revised only after a reviewer requests changes");
    }
    if (before.occurrences.length === 0) {
      throw new TeachingLeaveConflictError("This teaching leave request has no affected teaching sessions");
    }
    for (const occurrence of before.occurrences) {
      if (scheduledInstant(occurrence.sessionDate, occurrence.scheduledEndTime).getTime() <= Date.now()) {
        throw new TeachingLeaveValidationError("This teaching leave request can no longer be resubmitted because an affected session has ended");
      }
    }
    const nowLate = before.occurrences.some((occurrence) =>
      isTeachingLeaveLate(occurrence.sessionDate, occurrence.scheduledStartTime, before.noticeHours));

    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        requesterId: string;
        status: TeachingLeaveStatus;
        submittedLate: boolean;
        noticeHours: number;
      }>>`
        SELECT "requesterId","status","submittedLate","noticeHours"
        FROM "pms_attendance"."TeachingLeaveRequest"
        WHERE "id" = ${id}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new TeachingLeaveNotFoundError("Teaching leave request not found");
      if (current.requesterId !== user.id) {
        throw new TeachingLeaveAuthorizationError("Only the requesting lecturer can revise this teaching leave request");
      }
      if (current.status !== "CHANGES_REQUESTED") {
        throw new TeachingLeaveConflictError("Teaching leave can be revised only after a reviewer requests changes");
      }
      const submittedLate = current.submittedLate || nowLate;

      await tx.$executeRaw`
        UPDATE "pms_attendance"."TeachingLeaveRequest"
        SET "leaveType"=${input.leaveType},
            "confidentialReason"=${input.confidentialReason},
            "attachmentRef"=${input.attachmentRef ?? null},
            "proposedHandling"=${input.proposedHandling},
            "proposedNote"=${input.proposedNote ?? ""},
            "submittedLate"=${submittedLate},
            "status"='PENDING',
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${id}
      `;
      await tx.$executeRaw`
        INSERT INTO "pms_attendance"."TeachingLeaveAuditEvent"
          ("id","requestId","actorId","action","previousStatus","newStatus","details")
        VALUES (
          ${randomUUID()},${id},${user.id},'SUBMITTED','CHANGES_REQUESTED','PENDING',
          ${JSON.stringify({
            resubmitted: true,
            leaveType: input.leaveType,
            proposedHandling: input.proposedHandling,
            submittedLate,
          })}::jsonb
        )
      `;
    });

    return readRequest(id);
  },

  async mine(user: AuthUser): Promise<TeachingLeaveRequestView[]> {
    const ids = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "pms_attendance"."TeachingLeaveRequest"
      WHERE "requesterId" = ${user.id}
      ORDER BY "submittedAt" DESC
    `;
    const rows = await requestRowsByIds(ids.map((item) => item.id));
    return Promise.all(rows.map(toView));
  },

  async reviewQueue(user: AuthUser): Promise<TeachingLeaveRequestView[]> {
    const globalAdmin = user.programmeRoles.some((item) => item.role === "admin" && item.programmeId === null);
    const programmeIds = [...new Set(user.programmeRoles
      .filter((item) => item.programmeId && REVIEW_ROLES.includes(item.role as typeof REVIEW_ROLES[number]))
      .map((item) => item.programmeId!))];
    if (!globalAdmin && programmeIds.length === 0) {
      throw new TeachingLeaveAuthorizationError("Only a programme administrator or coordinator can review teaching leave");
    }

    let ids: Array<{ id: string }> = [];
    if (globalAdmin) {
      ids = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "pms_attendance"."TeachingLeaveRequest"
        WHERE "status" = 'PENDING'
        ORDER BY "submittedAt" ASC
      `;
    } else {
      for (const programmeId of programmeIds) {
        const scoped = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "pms_attendance"."TeachingLeaveRequest"
          WHERE "programmeId" = ${programmeId} AND "status" = 'PENDING'
          ORDER BY "submittedAt" ASC
        `;
        ids.push(...scoped);
      }
    }
    const rows = await requestRowsByIds([...new Set(ids.map((item) => item.id))]);
    return Promise.all(rows.map(toView));
  },

  async get(user: AuthUser, id: string): Promise<TeachingLeaveRequestView> {
    const request = await readRequest(id);
    if (request.requester.id !== user.id && !isManager(user, request.programmeId)) {
      throw new TeachingLeaveAuthorizationError("You cannot view this teaching leave request");
    }
    return request;
  },

  async review(user: AuthUser, id: string, input: ReviewTeachingLeaveRequest): Promise<TeachingLeaveReviewResult> {
    const before = await readRequest(id);
    if (!isManager(user, before.programmeId)) {
      throw new TeachingLeaveAuthorizationError("Only a programme administrator or coordinator can review teaching leave");
    }
    if (before.requester.id === user.id) {
      throw new TeachingLeaveAuthorizationError("A lecturer cannot review their own teaching leave request");
    }
    if (input.decision === "REQUEST_CHANGES" && !input.comment?.trim()) {
      throw new TeachingLeaveValidationError("Reviewer guidance is required when requesting changes");
    }
    const target: TeachingLeaveStatus = input.decision === "APPROVE"
      ? "APPROVED"
      : input.decision === "REJECT"
        ? "REJECTED"
        : "CHANGES_REQUESTED";

    let changed = false;
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: TeachingLeaveStatus; requesterId: string; programmeId: string }>>`
        SELECT "status","requesterId","programmeId"
        FROM "pms_attendance"."TeachingLeaveRequest"
        WHERE "id" = ${id}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new TeachingLeaveNotFoundError("Teaching leave request not found");
      if (current.requesterId === user.id) throw new TeachingLeaveAuthorizationError("A lecturer cannot review their own teaching leave request");
      if (!isManager(user, current.programmeId)) throw new TeachingLeaveAuthorizationError("You cannot review teaching leave for this programme");
      if (current.status === target) return;
      if (current.status === "CHANGES_REQUESTED") {
        throw new TeachingLeaveConflictError("Waiting for the requesting lecturer to revise and resubmit this teaching leave request");
      }
      if (current.status !== "PENDING") {
        throw new TeachingLeaveConflictError("This teaching leave request already has a final decision");
      }

      const links = await tx.$queryRaw<Array<{ occurrenceId: string }>>`
        SELECT "occurrenceId" FROM "pms_attendance"."TeachingLeaveRequestOccurrence"
        WHERE "requestId" = ${id}
        ORDER BY "occurrenceId"
      `;
      if (target === "APPROVED") {
        for (const link of links) {
          const occurrences = await tx.$queryRaw<Array<{ approvedLeaveRequestId: string | null }>>`
            SELECT "approvedLeaveRequestId"
            FROM "pms_attendance"."TeachingSessionOccurrence"
            WHERE "id" = ${link.occurrenceId}
            FOR UPDATE
          `;
          const occurrence = occurrences[0];
          if (!occurrence) throw new TeachingLeaveConflictError("An affected teaching session no longer exists");
          if (occurrence.approvedLeaveRequestId && occurrence.approvedLeaveRequestId !== id) {
            throw new TeachingLeaveConflictError("An affected teaching session already has another approved leave request");
          }
          await tx.$executeRaw`
            UPDATE "pms_attendance"."TeachingSessionOccurrence"
            SET "approvedLeaveRequestId" = ${id}, "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${link.occurrenceId}
          `;
        }
      }

      await tx.$executeRaw`
        UPDATE "pms_attendance"."TeachingLeaveRequest"
        SET "status"=${target}, "reviewedById"=${user.id}, "reviewedAt"=CURRENT_TIMESTAMP,
            "reviewComment"=${input.comment ?? ""}, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${id}
      `;
      await tx.$executeRaw`
        INSERT INTO "pms_attendance"."TeachingLeaveAuditEvent"
          ("id","requestId","actorId","action","previousStatus","newStatus","details")
        VALUES (
          ${randomUUID()},${id},${user.id},${input.decision === "APPROVE" ? "APPROVED" : input.decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED"},
          ${current.status},${target},${JSON.stringify({ comment: input.comment ?? "" })}::jsonb
        )
      `;
      changed = true;
    });

    const request = await readRequest(id);
    const notifications = request.status === "APPROVED"
      ? await approvedNotifications(request)
      : {
          requester: await requesterNotification(request),
          students: { sent: 0, failed: 0, duplicate: 0, missing: 0 },
          lecturerGroup: [],
        };
    return { request, changed, notifications };
  },
};
