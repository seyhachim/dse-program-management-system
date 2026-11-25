import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import {
  TelegramStudentRegistrationInputSchema,
  type PendingRegistrationReceipt,
} from "./student-registration-contract.ts";

export class TelegramStudentRegistrationError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "INVALID_VERIFICATION" | "IDENTITY_CONFLICT" | "INVALID_PLACEMENT" | "ALREADY_SUBMITTED") {
    super(code);
    this.name = "TelegramStudentRegistrationError";
  }
}

/**
 * Pending intake only. The receipt is not an authentication credential.
 * Never create a User, Student, enrollment, identity link, or role here.
 * Staff review must recheck linked identities and official roster evidence.
 */
export async function submitTelegramStudentRegistration(
  rawInput: unknown,
  programmeId: string,
): Promise<PendingRegistrationReceipt> {
  const parsed = TelegramStudentRegistrationInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new TelegramStudentRegistrationError("INVALID_INPUT");
  const input = parsed.data;

  return prisma.$transaction(async (tx) => {
    const verifications = await tx.$queryRaw<Array<{ telegramUserId: string }>>`
      SELECT "telegramUserId"
      FROM "telegram_security"."TelegramInitVerification"
      WHERE "id" = ${input.verificationId}
        AND "consumedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP
      FOR UPDATE
    `;
    const verification = verifications[0];
    if (!verification) throw new TelegramStudentRegistrationError("INVALID_VERIFICATION");

    const linked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "telegram_security"."TelegramIdentity"
      WHERE "telegramUserId" = ${verification.telegramUserId}
      LIMIT 1
    `;
    // Revoked links also require staff recovery, never a second account.
    if (linked.length) throw new TelegramStudentRegistrationError("IDENTITY_CONFLICT");

    const placement = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT c."id" FROM "StudentCohort" c
      JOIN "StudentCohortSection" s ON s."cohortId" = c."id"
      WHERE c."id" = ${input.cohortId} AND s."id" = ${input.sectionId}
        AND c."programmeId" = ${programmeId}
        AND c."status" = 'Active' AND s."active" = TRUE
      FOR SHARE OF c, s
    `;
    if (!placement.length) throw new TelegramStudentRegistrationError("INVALID_PLACEMENT");

    const requestId = randomUUID();
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "telegram_security"."StudentRegistrationRequest" (
        "id", "telegramUserId", "programmeId", "cohortId", "sectionId",
        "khmerFamilyName", "khmerGivenName", "latinFamilyName", "latinGivenName",
        "officialStudentId", "email"
      ) VALUES (
        ${requestId}, ${verification.telegramUserId}, ${programmeId},
        ${input.cohortId}, ${input.sectionId}, ${input.khmerFamilyName},
        ${input.khmerGivenName}, ${input.latinFamilyName}, ${input.latinGivenName},
        ${input.officialStudentId ?? null}, ${input.email ?? null}
      )
      ON CONFLICT ("telegramUserId") DO NOTHING
      RETURNING "id"
    `;
    if (!inserted.length) throw new TelegramStudentRegistrationError("ALREADY_SUBMITTED");

    const consumed = await tx.$executeRaw`
      UPDATE "telegram_security"."TelegramInitVerification"
      SET "consumedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.verificationId} AND "consumedAt" IS NULL
        AND "expiresAt" > CURRENT_TIMESTAMP
    `;
    if (consumed !== 1) throw new TelegramStudentRegistrationError("INVALID_VERIFICATION");

    return { requestId, status: "PENDING" as const };
  });
}
