import { randomUUID } from "node:crypto";
import type { OpenTeachingSlotStudentAssignment } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { createTelegramDeepLink } from "./deep-link.ts";
import { sendTelegramPmsMessage } from "./notification-service.ts";

type RecipientRow = {
  identityId: string;
  telegramUserId: string;
};

type EnrollmentRecipientRow = {
  studentId: string;
  identityId: string | null;
  telegramUserId: string | null;
};

type DeliveryStatus = "sent" | "failed" | "duplicate";

type ClaimantDecisionInput = {
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
};

async function eligibleUserRecipient(userId: string): Promise<RecipientRow | null> {
  const rows = await prisma.$queryRaw<RecipientRow[]>`
    SELECT ti."id" AS "identityId", ti."telegramUserId"
    FROM "telegram_security"."TelegramIdentity" ti
    WHERE ti."userId" = ${userId}
      AND ti."revokedAt" IS NULL
    ORDER BY ti."linkedAt" DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function enrolledRecipients(offeringId: string): Promise<EnrollmentRecipientRow[]> {
  return prisma.$queryRaw<EnrollmentRecipientRow[]>`
    SELECT e."studentId", ti."identityId", ti."telegramUserId"
    FROM "Enrollment" e
    JOIN "Student" s ON s."id" = e."studentId" AND s."status" = 'Active'
    LEFT JOIN LATERAL (
      SELECT identity."id" AS "identityId", identity."telegramUserId"
      FROM "telegram_security"."TelegramIdentity" identity
      WHERE identity."userId" = s."userId"
        AND identity."revokedAt" IS NULL
      ORDER BY identity."linkedAt" DESC
      LIMIT 1
    ) ti ON TRUE
    WHERE e."offeringId" = ${offeringId}
    ORDER BY e."studentId"
  `;
}

async function claimDelivery(
  identityId: string,
  eventKey: string,
  kind: string,
  resourceId: string,
): Promise<string | null> {
  const id = randomUUID();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "telegram_security"."TelegramNotificationDelivery" AS delivery
      ("id", "identityId", "eventKey", "kind", "resourceId", "status", "attempts")
    VALUES (${id}, ${identityId}, ${eventKey}, ${kind}, ${resourceId}, 'pending', 0)
    ON CONFLICT ("identityId", "eventKey") DO UPDATE
      SET "status"='pending', "lastError"=NULL, "updatedAt"=CURRENT_TIMESTAMP
      WHERE delivery."status"='failed'
    RETURNING "id"
  `;
  return rows[0]?.id ?? null;
}

async function finishDelivery(
  deliveryId: string,
  work: () => Promise<string>,
): Promise<"sent" | "failed"> {
  try {
    const messageId = await work();
    await prisma.$executeRaw`
      UPDATE "telegram_security"."TelegramNotificationDelivery"
      SET "status"='sent', "attempts"="attempts"+1, "lastError"=NULL,
          "telegramMessageId"=${messageId}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${deliveryId}
    `;
    return "sent";
  } catch (error) {
    const message = error instanceof Error
      ? error.message.slice(0, 1000)
      : "Unknown Telegram delivery failure";
    await prisma.$executeRaw`
      UPDATE "telegram_security"."TelegramNotificationDelivery"
      SET "status"='failed', "attempts"="attempts"+1, "lastError"=${message},
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${deliveryId}
    `;
    return "failed";
  }
}

async function deliver(
  recipient: RecipientRow,
  eventKey: string,
  kind: string,
  resourceId: string,
  text: string,
  url: string,
): Promise<DeliveryStatus> {
  const deliveryId = await claimDelivery(recipient.identityId, eventKey, kind, resourceId);
  if (!deliveryId) return "duplicate";
  return finishDelivery(
    deliveryId,
    () => sendTelegramPmsMessage(recipient.telegramUserId, text, url),
  );
}

export function openTeachingSlotStudentText(
  assignment: OpenTeachingSlotStudentAssignment,
): string {
  return [
    "Additional class confirmed",
    "",
    `${assignment.courseCode} · ${assignment.courseTitle} · Class ${assignment.sectionCode}`,
    `Lecturer: ${assignment.lecturerName}`,
    `${assignment.sessionDate} · ${assignment.startTime}–${assignment.endTime}`,
    assignment.room ? `Room: ${assignment.room}` : "Room: not set",
    "This is a confirmed class for this course. It does not count as a make-up for another course.",
  ].join("\n");
}

export function openTeachingSlotClaimantText(input: ClaimantDecisionInput): string {
  return [
    `Open teaching slot claim ${input.status === "APPROVED" ? "approved" : "rejected"}`,
    "",
    `${input.courseCode} · ${input.courseTitle} · Class ${input.sectionCode}`,
    `${input.sessionDate} · ${input.startTime}–${input.endTime}`,
    input.room ? `Room: ${input.room}` : "Room: not set",
    input.status === "APPROVED"
      ? "The class is now confirmed in DSE PMS."
      : "The slot is not assigned to your course. Check DSE PMS for the current slot status.",
  ].join("\n");
}

export const openTeachingSlotNotificationService = {
  async deliverClaimant(
    input: ClaimantDecisionInput,
  ): Promise<"sent" | "missing" | "failed" | "duplicate"> {
    const recipient = await eligibleUserRecipient(input.userId);
    if (!recipient) return "missing";
    return deliver(
      recipient,
      `open-teaching-slot:${input.claimId}:claimant:${input.status}`,
      "open_teaching_slot_claimant",
      input.claimId,
      openTeachingSlotClaimantText(input),
      createTelegramDeepLink("/telegram/schedule"),
    );
  },

  async deliverStudents(
    assignment: OpenTeachingSlotStudentAssignment,
  ): Promise<{ sent: number; failed: number; duplicate: number; missing: number }> {
    const recipients = await enrolledRecipients(assignment.offeringId);
    const summary = { sent: 0, failed: 0, duplicate: 0, missing: 0 };
    const linked: RecipientRow[] = [];

    for (const recipient of recipients) {
      if (!recipient.identityId || !recipient.telegramUserId) {
        summary.missing += 1;
        continue;
      }
      linked.push({
        identityId: recipient.identityId,
        telegramUserId: recipient.telegramUserId,
      });
    }

    const eventKey = `open-teaching-slot:${assignment.slotId}:${assignment.occurrenceId}:students`;
    const text = openTeachingSlotStudentText(assignment);
    const url = createTelegramDeepLink("/telegram/schedule");
    const statuses = await Promise.all(
      linked.map((recipient) =>
        deliver(
          recipient,
          eventKey,
          "open_teaching_slot_student",
          assignment.occurrenceId,
          text,
          url,
        ),
      ),
    );
    for (const status of statuses) summary[status] += 1;
    return summary;
  },
};
