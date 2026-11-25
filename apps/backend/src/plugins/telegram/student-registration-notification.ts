import { prisma } from "../../core/db/prisma.ts";
import { getPmsTelegramConfig } from "./config.ts";
import { sendTelegramPmsMessage } from "./notification-service.ts";

type NotificationState = "SENT" | "FAILED" | "PENDING";
export async function deliverRegistrationDecision(reviewId: string): Promise<NotificationState> {
  try {
    const rows=await prisma.$queryRaw<Array<{ telegramUserId:string;decision:string }>>`
      UPDATE "telegram_security"."StudentRegistrationReview" AS rev
      SET "notificationState"='SENDING',"notificationUpdatedAt"=CURRENT_TIMESTAMP
      FROM "telegram_security"."StudentRegistrationRequest" r
      WHERE rev."id"=${reviewId} AND rev."requestId"=r."id"
        AND rev."notificationState"='PENDING'
      RETURNING r."telegramUserId",rev."decision"
    `;
    const row=rows[0];if(!row)return "PENDING";
    const config=getPmsTelegramConfig();
    try {
      if(!config.enabled||!config.miniAppUrl)throw new Error("Telegram unavailable");
      const message=row.decision==="APPROVE"
        ? "Your DSE PMS registration was approved. Open the PMS Mini App to access your student account."
        : row.decision==="REQUEST_CORRECTION"
        ? "Your DSE PMS registration requires corrections. Contact your coordinator, then restart registration from the official bot."
        : "Your DSE PMS registration was not approved. Contact your coordinator for clarification.";
      const url=row.decision==="APPROVE"?config.miniAppUrl:new URL("/telegram/registration",config.miniAppUrl).toString();
      const boundedFetch:typeof fetch=(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)});
      const messageId=await sendTelegramPmsMessage(row.telegramUserId,message,url,boundedFetch);
      await prisma.$executeRaw`UPDATE "telegram_security"."StudentRegistrationReview" SET "notificationState"='SENT',"notificationMessageId"=${messageId},"notificationUpdatedAt"=CURRENT_TIMESTAMP WHERE "id"=${reviewId} AND "notificationState"='SENDING'`;
      return "SENT";
    } catch {
      await prisma.$executeRaw`UPDATE "telegram_security"."StudentRegistrationReview" SET "notificationState"='FAILED',"notificationUpdatedAt"=CURRENT_TIMESTAMP WHERE "id"=${reviewId} AND "notificationState"='SENDING'`;
      return "FAILED";
    }
  } catch {
    // A committed review must never appear to have rolled back due to a notification error.
    return "PENDING";
  }
}
