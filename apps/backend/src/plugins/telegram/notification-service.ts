import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { getTelegramConfig } from "./config.ts";
import { createTelegramDeepLink } from "./deep-link.ts";

type RecipientRow = {
  identityId: string;
  telegramUserId: string;
};

async function eligibleAnnouncementRecipients(offeringId: string): Promise<RecipientRow[]> {
  return prisma.$queryRaw<RecipientRow[]>`
    SELECT DISTINCT ti."id" AS "identityId", ti."telegramUserId"
    FROM "Enrollment" e
    JOIN "Student" s ON s."id" = e."studentId"
    JOIN "telegram_security"."TelegramIdentity" ti ON ti."userId" = s."userId"
    LEFT JOIN "telegram_security"."TelegramNotificationPreference" pref
      ON pref."identityId" = ti."id"
    WHERE e."offeringId" = ${offeringId}
      AND ti."revokedAt" IS NULL
      AND COALESCE(pref."announcementsEnabled", TRUE) = TRUE
  `;
}

async function sendTelegramMessage(chatId: string, text: string, url: string) {
  const config = getTelegramConfig();
  if (!config.enabled || !config.botToken) throw new Error("Telegram notification delivery is disabled");
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: [[{ text: "Open in DSE PMS", web_app: { url } }]] },
    }),
  });
  const payload = await response.json() as { ok?: boolean; result?: { message_id?: number }; description?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.description ?? `Telegram API ${response.status}`);
  return String(payload.result?.message_id ?? "");
}

async function claimDelivery(identityId: string, eventKey: string, resourceId: string) {
  const id = randomUUID();
  const inserted = await prisma.$executeRaw`
    INSERT INTO "telegram_security"."TelegramNotificationDelivery"
      ("id", "identityId", "eventKey", "kind", "resourceId", "status", "attempts")
    VALUES (${id}, ${identityId}, ${eventKey}, 'announcement', ${resourceId}, 'pending', 0)
    ON CONFLICT ("identityId", "eventKey") DO NOTHING
  `;
  return inserted > 0 ? id : null;
}

export const telegramNotificationService = {
  async deliverAnnouncement(input: {
    announcementId: string;
    offeringId: string;
    courseCode: string;
    title: string;
    body: string;
  }) {
    const recipients = await eligibleAnnouncementRecipients(input.offeringId);
    const eventKey = `announcement:${input.announcementId}`;
    const deepLink = createTelegramDeepLink(`/telegram/classes/${encodeURIComponent(input.offeringId)}?announcement=${encodeURIComponent(input.announcementId)}`);

    // Notification delivery is intentionally best-effort. Every attempt is
    // persisted, but a transient Telegram outage must never roll back the PMS
    // announcement transaction that already succeeded.
    await Promise.allSettled(recipients.map(async (recipient) => {
      const deliveryId = await claimDelivery(recipient.identityId, eventKey, input.announcementId);
      if (!deliveryId) return;
      try {
        const messageId = await sendTelegramMessage(
          recipient.telegramUserId,
          `${input.courseCode}: ${input.title}\n\n${input.body}`,
          deepLink,
        );
        await prisma.$executeRaw`
          UPDATE "telegram_security"."TelegramNotificationDelivery"
          SET "status" = 'sent', "attempts" = 1, "telegramMessageId" = ${messageId}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${deliveryId}
        `;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown Telegram delivery failure";
        await prisma.$executeRaw`
          UPDATE "telegram_security"."TelegramNotificationDelivery"
          SET "status" = 'failed', "attempts" = 1, "lastError" = ${message}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${deliveryId}
        `;
      }
    }));
  },

  async preferences(identityId: string) {
    const rows = await prisma.$queryRaw<Array<{ announcementsEnabled: boolean }>>`
      SELECT "announcementsEnabled"
      FROM "telegram_security"."TelegramNotificationPreference"
      WHERE "identityId" = ${identityId}
      LIMIT 1
    `;
    return { announcementsEnabled: rows[0]?.announcementsEnabled ?? true };
  },

  async setPreferences(identityId: string, announcementsEnabled: boolean) {
    await prisma.$executeRaw`
      INSERT INTO "telegram_security"."TelegramNotificationPreference"
        ("identityId", "announcementsEnabled", "updatedAt")
      VALUES (${identityId}, ${announcementsEnabled}, CURRENT_TIMESTAMP)
      ON CONFLICT ("identityId") DO UPDATE
      SET "announcementsEnabled" = EXCLUDED."announcementsEnabled", "updatedAt" = CURRENT_TIMESTAMP
    `;
    return { announcementsEnabled };
  },
};
