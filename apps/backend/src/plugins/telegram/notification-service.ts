import { randomUUID } from "node:crypto";
import type { TeachingLeaveOperationalImpact, TeachingLeaveStatus } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { getPmsTelegramConfig } from "./config.ts";
import { createTelegramDeepLink } from "./deep-link.ts";

type RecipientRow = {
  identityId: string;
  telegramUserId: string;
};

type DeliveryStatus = "sent" | "failed" | "duplicate";

async function eligibleAnnouncementRecipients(offeringId: string): Promise<RecipientRow[]> {
  return prisma.$queryRaw<RecipientRow[]>`
    SELECT DISTINCT ti."id" AS "identityId", ti."telegramUserId"
    FROM "Enrollment" e
    JOIN "Student" s ON s."id" = e."studentId"
    JOIN "telegram_security"."TelegramIdentity" ti ON ti."userId" = s."userId"
    LEFT JOIN "telegram_security"."TelegramNotificationPreference" pref ON pref."identityId" = ti."id"
    WHERE e."offeringId" = ${offeringId}
      AND ti."revokedAt" IS NULL
      AND COALESCE(pref."announcementsEnabled", TRUE) = TRUE
  `;
}

async function eligibleStudentRecipient(studentId: string): Promise<RecipientRow | null> {
  const rows = await prisma.$queryRaw<RecipientRow[]>`
    SELECT ti."id" AS "identityId", ti."telegramUserId"
    FROM "Student" s
    JOIN "telegram_security"."TelegramIdentity" ti ON ti."userId" = s."userId"
    WHERE s."id" = ${studentId}
      AND ti."revokedAt" IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function eligibleUserRecipient(userId: string): Promise<RecipientRow | null> {
  const rows = await prisma.$queryRaw<RecipientRow[]>`
    SELECT ti."id" AS "identityId", ti."telegramUserId"
    FROM "telegram_security"."TelegramIdentity" ti
    WHERE ti."userId" = ${userId} AND ti."revokedAt" IS NULL
    ORDER BY ti."linkedAt" DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function sendTelegramPmsPayload(
  chatId: string,
  text: string,
  replyMarkup: unknown,
  fetchImpl: typeof fetch,
) {
  const config = getPmsTelegramConfig();
  if (!config.enabled || !config.botToken) throw new Error("Telegram notification delivery is disabled");
  const response = await fetchImpl(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
  });
  const payload = await response.json() as { ok?: boolean; result?: { message_id?: number }; description?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.description ?? `Telegram API ${response.status}`);
  return String(payload.result?.message_id ?? "");
}

/**
 * PMS delivery boundary. Positive Telegram user ids use a Web App button;
 * groups/supergroups/channels use negative chat ids and therefore receive an
 * ordinary URL button (Web App buttons are private-chat only).
 */
export async function sendTelegramPmsMessage(
  chatId: string,
  text: string,
  url: string,
  fetchImpl: typeof fetch = fetch,
) {
  const replyMarkup = chatId.startsWith("-")
    ? { inline_keyboard: [[{ text: "Open DSE PMS", url }]] }
    : { inline_keyboard: [[{ text: "Open in DSE PMS", web_app: { url } }]] };
  return sendTelegramPmsPayload(chatId, text, replyMarkup, fetchImpl);
}

/** Explicit group/channel sender for callers that already know the chat kind. */
export async function sendTelegramPmsDestinationMessage(
  chatId: string,
  text: string,
  url: string,
  fetchImpl: typeof fetch = fetch,
) {
  return sendTelegramPmsPayload(
    chatId,
    text,
    { inline_keyboard: [[{ text: "Open DSE PMS", url }]] },
    fetchImpl,
  );
}

/**
 * Claim one logical private delivery. Sent/pending events stay idempotent; a
 * failed event is reclaimed so an authoritative PMS action can retry delivery
 * without creating a second logical row.
 */
async function claimDelivery(identityId: string, eventKey: string, kind: string, resourceId: string) {
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

async function finishDelivery(deliveryId: string, work: () => Promise<string>): Promise<"sent" | "failed"> {
  try {
    const messageId = await work();
    await prisma.$executeRaw`
      UPDATE "telegram_security"."TelegramNotificationDelivery"
      SET "status" = 'sent', "attempts" = "attempts" + 1, "lastError" = NULL,
          "telegramMessageId" = ${messageId}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${deliveryId}
    `;
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown Telegram delivery failure";
    await prisma.$executeRaw`
      UPDATE "telegram_security"."TelegramNotificationDelivery"
      SET "status" = 'failed', "attempts" = "attempts" + 1, "lastError" = ${message}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${deliveryId}
    `;
    return "failed";
  }
}

async function deliverToRecipient(
  recipient: RecipientRow,
  eventKey: string,
  kind: string,
  resourceId: string,
  text: string,
  url: string,
): Promise<DeliveryStatus> {
  const deliveryId = await claimDelivery(recipient.identityId, eventKey, kind, resourceId);
  if (!deliveryId) return "duplicate";
  return finishDelivery(deliveryId, () => sendTelegramPmsMessage(recipient.telegramUserId, text, url));
}

export function attendanceWarningEventKey(input: {
  studentId: string;
  offeringId: string;
  warningKind: "attendance" | "punctuality";
  eventSessionId: string;
}) {
  return `attendance-warning:${input.studentId}:${input.offeringId}:${input.warningKind}:3:${input.eventSessionId}`;
}

function leaveDecisionLabel(status: TeachingLeaveStatus): string {
  if (status === "APPROVED") return "approved";
  if (status === "REJECTED") return "rejected";
  if (status === "CHANGES_REQUESTED") return "needs changes";
  if (status === "WITHDRAWN") return "withdrawn";
  return "submitted";
}

export const telegramNotificationService = {
  workflowUrl(path: string) {
    return createTelegramDeepLink(path);
  },

  async deliverTeachingLeaveRequester(input: {
    requestId: string;
    userId: string;
    status: TeachingLeaveStatus;
    firstOccurrence: TeachingLeaveOperationalImpact;
  }): Promise<"sent" | "missing" | "failed" | "duplicate"> {
    const recipient = await eligibleUserRecipient(input.userId);
    if (!recipient) return "missing";
    const impact = input.firstOccurrence;
    const eventKey = `teaching-leave:${input.requestId}:requester:${input.status}`;
    const link = createTelegramDeepLink(`/telegram/schedule?offeringId=${encodeURIComponent(impact.offeringId)}`);
    return deliverToRecipient(
      recipient,
      eventKey,
      "teaching_leave_requester",
      input.requestId,
      [
        `Teaching leave ${leaveDecisionLabel(input.status)}`,
        "",
        `${impact.courseCode} · Class ${impact.sectionCode}`,
        `${impact.sessionDate} · ${impact.startTime}–${impact.endTime}`,
        "Open DSE PMS for the current request status and any reviewer guidance.",
      ].join("\n"),
      link,
    );
  },

  async deliverTeachingLeaveStudents(input: TeachingLeaveOperationalImpact): Promise<{
    sent: number;
    failed: number;
    duplicate: number;
    missing: number;
  }> {
    const recipients = await eligibleAnnouncementRecipients(input.offeringId);
    const summary = { sent: 0, failed: 0, duplicate: 0, missing: 0 };
    if (recipients.length === 0) return summary;
    const eventKey = `teaching-leave:${input.requestId}:${input.occurrenceId}:students`;
    const link = createTelegramDeepLink(`/telegram/schedule?offeringId=${encodeURIComponent(input.offeringId)}`);
    const text = [
      "Teaching schedule update",
      "",
      `${input.courseCode} · ${input.courseTitle} · Class ${input.sectionCode}`,
      `${input.sessionDate} · ${input.startTime}–${input.endTime}`,
      input.room ? `Room: ${input.room}` : "Room: not set",
      "This scheduled session is affected by an approved teaching availability change. Check DSE PMS for the confirmed recovery or updated schedule.",
    ].join("\n");
    const statuses = await Promise.all(recipients.map((recipient) =>
      deliverToRecipient(recipient, eventKey, "teaching_leave_student", input.requestId, text, link)));
    for (const status of statuses) summary[status] += 1;
    return summary;
  },

  async deliverAnnouncement(input: { announcementId: string; offeringId: string; title: string; body: string }) {
    const offering = await prisma.offering.findUnique({
      where: { id: input.offeringId },
      select: { course: { select: { code: true } } },
    });
    if (!offering) return;
    const recipients = await eligibleAnnouncementRecipients(input.offeringId);
    const eventKey = `announcement:${input.announcementId}`;
    const deepLink = createTelegramDeepLink(`/telegram/classes/${encodeURIComponent(input.offeringId)}?announcement=${encodeURIComponent(input.announcementId)}`);

    await Promise.allSettled(recipients.map(async (recipient) => {
      const deliveryId = await claimDelivery(recipient.identityId, eventKey, "announcement", input.announcementId);
      if (!deliveryId) return;
      await finishDelivery(deliveryId, () => sendTelegramPmsMessage(
        recipient.telegramUserId,
        `${offering.course.code}: ${input.title}\n\n${input.body}`,
        deepLink,
      ));
    }));
  },

  async deliverPermissionPending(input: {
    permissionPendingId: string;
    studentId: string;
    offeringId: string;
    date: string;
  }) {
    const [recipient, offering] = await Promise.all([
      eligibleStudentRecipient(input.studentId),
      prisma.offering.findUnique({
        where: { id: input.offeringId },
        select: { course: { select: { code: true } } },
      }),
    ]);
    if (!recipient || !offering) return;
    const eventKey = `permission-pending:${input.permissionPendingId}`;
    const deliveryId = await claimDelivery(recipient.identityId, eventKey, "permission_pending", input.permissionPendingId);
    if (!deliveryId) return;
    const deepLink = createTelegramDeepLink(`/telegram/attendance?offeringId=${encodeURIComponent(input.offeringId)}`);
    await finishDelivery(deliveryId, () => sendTelegramPmsMessage(
      recipient.telegramUserId,
      `Permission letter reminder\n\n${offering.course.code} · ${input.date}\nYour permission is still pending. Please give the paper permission letter to your lecturer, preferably before your next class.`,
      deepLink,
    ));
  },

  async deliverAttendanceWarning(input: {
    studentId: string;
    offeringId: string;
    warningKind: "attendance" | "punctuality";
    count: number;
    eventSessionId: string;
    absentCount: number;
    excusedCount: number;
  }) {
    if (input.count !== 3) return;
    const [recipient, offering] = await Promise.all([
      eligibleStudentRecipient(input.studentId),
      prisma.offering.findUnique({
        where: { id: input.offeringId },
        select: { course: { select: { code: true, title: true } } },
      }),
    ]);
    if (!recipient || !offering) return;
    const eventKey = attendanceWarningEventKey(input);
    const deliveryId = await claimDelivery(recipient.identityId, eventKey, "attendance_warning", input.eventSessionId);
    if (!deliveryId) return;
    const deepLink = createTelegramDeepLink(`/telegram/attendance?offeringId=${encodeURIComponent(input.offeringId)}`);
    const text = input.warningKind === "punctuality"
      ? `Punctuality reminder\n\n${offering.course.code} · ${offering.course.title}\nYou have been late to your last 3 finalized classes. Try to arrive 10–15 minutes early, set a reminder, and check the room and schedule in advance. If the issue continues, speak with your lecturer or adviser.`
      : `Attendance reminder\n\n${offering.course.code} · ${offering.course.title}\nYour finalized record now includes ${input.absentCount} absent and ${input.excusedCount} permission / excused (${input.absentCount + input.excusedCount} combined). Please review missed learning and contact your lecturer or programme team if you need support.`;
    await finishDelivery(deliveryId, () => sendTelegramPmsMessage(recipient.telegramUserId, text, deepLink));
  },

  async preferences(identityId: string) {
    const rows = await prisma.$queryRaw<Array<{ announcementsEnabled: boolean }>>`
      SELECT "announcementsEnabled" FROM "telegram_security"."TelegramNotificationPreference"
      WHERE "identityId" = ${identityId} LIMIT 1
    `;
    return { announcementsEnabled: rows[0]?.announcementsEnabled ?? true };
  },

  async setPreferences(identityId: string, announcementsEnabled: boolean) {
    await prisma.$executeRaw`
      INSERT INTO "telegram_security"."TelegramNotificationPreference" ("identityId", "announcementsEnabled", "updatedAt")
      VALUES (${identityId}, ${announcementsEnabled}, CURRENT_TIMESTAMP)
      ON CONFLICT ("identityId") DO UPDATE
      SET "announcementsEnabled" = EXCLUDED."announcementsEnabled", "updatedAt" = CURRENT_TIMESTAMP
    `;
    return { announcementsEnabled };
  },
};
