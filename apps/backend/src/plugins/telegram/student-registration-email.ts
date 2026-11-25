import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { UniversityEmailSchema } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { deliverEmail, readEmailDeliveryConfig } from "../../core/email/delivery.ts";

export class RegistrationEmailError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
import type { Prisma } from "@prisma/client";
type RequestRow = { id: string; email: string | null; emailVerifiedAt: Date | null; status: string };

export function codeDigest(secret: string, id: string, email: string, code: string): string {
  return createHmac("sha256",secret).update(JSON.stringify([id,email,code])).digest("hex");
}
function secret(): string {
  const value = process.env.TELEGRAM_REGISTRATION_EMAIL_OTP_SECRET;
  if (!value || value.length < 32) throw new RegistrationEmailError(503,"Email verification is unavailable");
  return value;
}
function mailConfig() {
  try { return readEmailDeliveryConfig(); }
  catch { throw new RegistrationEmailError(503,"Email verification is unavailable"); }
}
async function requestForSession(tx: Prisma.TransactionClient, verificationId: string): Promise<RequestRow> {
  const rows = await tx.$queryRaw<RequestRow[]>`
    SELECT r."id",r."email",r."emailVerifiedAt",r."status"
    FROM "telegram_security"."StudentRegistrationEmailSession" es
    JOIN "telegram_security"."TelegramInitVerification" v ON v."id"=es."verificationId"
    JOIN "telegram_security"."StudentRegistrationRequest" r ON r."telegramUserId"=v."telegramUserId"
    WHERE es."verificationId"=${verificationId} AND v."expiresAt">CURRENT_TIMESTAMP
      AND r."programmeId"=${DEFAULT_PROGRAMME_ID}
      AND NOT EXISTS (SELECT 1 FROM "telegram_security"."TelegramIdentity" i WHERE i."telegramUserId"=v."telegramUserId")
    FOR UPDATE OF r
  `;
  const row=rows[0];
  if (!row || row.status!=="PENDING") throw new RegistrationEmailError(403,"Registration session expired or unavailable");
  return row;
}

export async function sendRegistrationEmail(verificationId: string, rawEmail: string) {
  const email=UniversityEmailSchema.parse(rawEmail);
  const key=secret();
  const config=mailConfig();
  const id=randomUUID(),code=String(randomInt(0,1_000_000)).padStart(6,"0");
  const challenge=await prisma.$transaction(async tx=>{
    const request=await requestForSession(tx,verificationId);
    if (request.emailVerifiedAt) return false;
    if (request.email && request.email!==email) throw new RegistrationEmailError(409,"Request a correction to change your submitted email");
    // Lock the recipient across different Telegram identities, not only this application.
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended(${"registration-email:"+email},0))) locked`;
    const counts=await tx.$queryRaw<Array<{ perEmail: number; perRequest: number; recent: number }>>`
      SELECT
        COUNT(*) FILTER (WHERE "email"=${email} AND "createdAt">CURRENT_TIMESTAMP-INTERVAL '1 hour')::int AS "perEmail",
        COUNT(*) FILTER (WHERE "requestId"=${request.id} AND "createdAt">CURRENT_TIMESTAMP-INTERVAL '1 day')::int AS "perRequest",
        COUNT(*) FILTER (WHERE "requestId"=${request.id} AND "createdAt">CURRENT_TIMESTAMP-INTERVAL '60 seconds')::int AS "recent"
      FROM "telegram_security"."StudentRegistrationEmailChallenge"
      WHERE ("email"=${email} OR "requestId"=${request.id}) AND "createdAt">CURRENT_TIMESTAMP-INTERVAL '1 day'
    `;
    const count=counts[0]!;
    if(count.perEmail>=3||count.perRequest>=5||count.recent>0) throw new RegistrationEmailError(429,"Please wait before requesting another code");
    await tx.$executeRaw`UPDATE "telegram_security"."StudentRegistrationEmailChallenge" SET "consumedAt"=CURRENT_TIMESTAMP WHERE "requestId"=${request.id} AND "consumedAt" IS NULL`;
    await tx.$executeRaw`UPDATE "telegram_security"."StudentRegistrationRequest" SET "email"=${email},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${request.id}`;
    await tx.$executeRaw`
      INSERT INTO "telegram_security"."StudentRegistrationEmailChallenge" ("id","requestId","email","digest","expiresAt")
      VALUES (${id},${request.id},${email},${codeDigest(key,id,email,code)},CURRENT_TIMESTAMP+INTERVAL '10 minutes')
    `;
    return true;
  });
  if(!challenge)return {verified:true,sent:false};
  // An email provider acceptance is not proof of delivery or ownership.
  try {
    await deliverEmail(config,{id,to:email,subject:"DSE PMS university email verification",text:`Your DSE PMS registration code is ${code}. It expires in 10 minutes. Do not share it. If you did not request this code, ignore this email.`});
    await prisma.$executeRaw`UPDATE "telegram_security"."StudentRegistrationEmailChallenge" SET "deliveryAcceptedAt"=CURRENT_TIMESTAMP WHERE "id"=${id} AND "consumedAt" IS NULL`;
    return {verified:false,sent:true};
  } catch {
    await prisma.$executeRaw`UPDATE "telegram_security"."StudentRegistrationEmailChallenge" SET "consumedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
    throw new RegistrationEmailError(503,"Could not send the verification code. Try again later.");
  }
}

export async function verifyRegistrationEmail(verificationId: string, code: string) {
  const key=secret();
  // Return failures from the transaction so failed attempts persist.
  const verified=await prisma.$transaction(async tx=>{
    const request=await requestForSession(tx,verificationId);
    if(request.emailVerifiedAt)return true;
    if(!request.email)return false;
    const rows=await tx.$queryRaw<Array<{id:string;digest:string}>>`
      SELECT "id","digest" FROM "telegram_security"."StudentRegistrationEmailChallenge"
      WHERE "requestId"=${request.id} AND "email"=${request.email}
        AND "expiresAt">CURRENT_TIMESTAMP AND "consumedAt" IS NULL AND "attempts"<5 AND "deliveryAcceptedAt" IS NOT NULL
      ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE
    `;
    const row=rows[0];if(!row)return false;
    const expected=Buffer.from(row.digest,"hex");
    const supplied=Buffer.from(codeDigest(key,row.id,request.email,code),"hex");
    const match=expected.length===supplied.length&&timingSafeEqual(expected,supplied);
    await tx.$executeRaw`UPDATE "telegram_security"."StudentRegistrationEmailChallenge" SET "attempts"="attempts"+1,"consumedAt"=CASE WHEN ${match} OR "attempts"+1>=5 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE "id"=${row.id}`;
    if(!match)return false;
    await tx.$executeRaw`UPDATE "telegram_security"."StudentRegistrationRequest" SET "emailVerifiedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${request.id}`;
    return true;
  });
  if(!verified)throw new RegistrationEmailError(400,"Invalid or expired code. Request a new code if needed.");
  return {verified:true};
}
