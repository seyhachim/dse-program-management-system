import { prisma } from "../../core/db/prisma.ts";
import { getPmsTelegramConfig } from "./config.ts";
import { parseStudentRegistrationBotAction, STUDENT_REGISTRATION_SKIP } from "./student-registration-bot-contract.ts";

// Used exclusively after the existing PMS webhook secret has been verified.
export async function studentRegistrationBotReply(raw: unknown) {
  if (process.env.TELEGRAM_STUDENT_REGISTRATION_ENABLED !== "true") return null;
  const action = parseStudentRegistrationBotAction(raw);
  if (!action) return null;
  const config = getPmsTelegramConfig();
  if (!config.enabled || !config.miniAppUrl) return null;
  const chatId = Number(action.telegramUserId);
  const reply = (text: string, reply_markup: object) => ({
    method: "sendMessage", chat_id: chatId, text, reply_markup,
  });
  const removeKeyboard = { remove_keyboard: true };
  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "telegram_security"."TelegramIdentity"
    WHERE "telegramUserId" = ${action.telegramUserId} LIMIT 1
  `;
  if (existing.length) return reply("You already have or previously had a PMS account. Please use your existing account or contact the DSE coordinator for recovery.", removeKeyboard);
  const pending = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id", "status" FROM "telegram_security"."StudentRegistrationRequest"
    WHERE "telegramUserId" = ${action.telegramUserId} LIMIT 1
  `;
  const registrationUrl = new URL("/telegram/registration", config.miniAppUrl).toString();
  const openRegistration = { inline_keyboard: [[{ text: "Open registration", web_app: { url: registrationUrl } }]] };
  if (pending[0] && pending[0].status !== "NEEDS_CORRECTION") return reply("You already submitted a registration. Open registration to check your status.", openRegistration);
  if (action.kind === "start") {
    await prisma.$executeRaw`
      INSERT INTO "telegram_security"."StudentRegistrationBotConsent" ("telegramUserId", "state", "expiresAt")
      VALUES (${action.telegramUserId}, 'AWAITING_CONTACT', CURRENT_TIMESTAMP + INTERVAL '30 minutes')
      ON CONFLICT ("telegramUserId") DO UPDATE
      SET "state" = 'AWAITING_CONTACT', "phone" = NULL, "consentAt" = NULL,
          "expiresAt" = CURRENT_TIMESTAMP + INTERVAL '30 minutes'
    `;
    return reply("Welcome to DSE PMS. Sharing your own Telegram phone number is optional. DSE staff will use it only to help verify your student registration. It does not grant account access. You may continue without sharing.", {
      keyboard: [[{ text: "Share my phone number", request_contact: true }], [{ text: STUDENT_REGISTRATION_SKIP }]],
      resize_keyboard: true, one_time_keyboard: true,
    });
  }
  const phone = action.kind === "contact" ? action.phone : null;
  const changed = await prisma.$executeRaw`
    UPDATE "telegram_security"."StudentRegistrationBotConsent"
    SET "state" = ${phone ? "SHARED" : "SKIPPED"}, "phone" = ${phone},
        "consentAt" = CASE WHEN ${phone}::text IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END
    WHERE "telegramUserId" = ${action.telegramUserId}
      AND "state" = 'AWAITING_CONTACT' AND "expiresAt" > CURRENT_TIMESTAMP
  `;
  if (changed !== 1) return reply("Your registration session is not active. Open PMS and choose Register with Telegram again.", removeKeyboard);
  // No authentication token or phone data is placed in this URL.
  return reply("Continue to the PMS Mini App to complete your student registration. Your registration requires staff approval.", {
    inline_keyboard: [[{ text: "Complete registration", web_app: { url: registrationUrl } }]],
  });
}
