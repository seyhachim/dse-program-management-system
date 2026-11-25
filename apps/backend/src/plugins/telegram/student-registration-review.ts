import { randomUUID } from "node:crypto";
import { UniversityEmailSchema, StudentCareerProfileSchema } from "@dse-pms/shared-types";
import type { TelegramRegistrationStaffRow, TelegramRegistrationReviewInput, TelegramRegistrationRosterCandidate, TelegramRegistrationStatus } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { hasAnyRoleInProgramme, type AuthUser } from "../../core/auth/token.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";

export class RegistrationReviewError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function canReviewRegistration(user: AuthUser, programmeId = DEFAULT_PROGRAMME_ID) {
  return hasAnyRoleInProgramme(user, ["admin", "program_coordinator"], programmeId);
}
function assertReviewer(user: AuthUser) {
  if (!canReviewRegistration(user)) throw new RegistrationReviewError(403, "Programme registration access denied");
}
function eligibleRosterEmail(email: string | null): email is string {
  return UniversityEmailSchema.safeParse(email).success;
}
type Row = Omit<TelegramRegistrationStaffRow, "createdAt" | "updatedAt" | "emailVerifiedAt"> & { createdAt: Date; updatedAt: Date; emailVerifiedAt: Date | null };

export async function listRegistrationRequests(user: AuthUser, status: TelegramRegistrationStatus, offset: number) {
  assertReviewer(user);
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT r."id", r."status", r."khmerFamilyName", r."khmerGivenName", r."latinFamilyName", r."latinGivenName",
      r."cohortId", c."code" AS "cohortCode", s."code" AS "sectionCode", r."officialStudentId",
      r."email", r."telegramPhone", r."emailVerifiedAt", r."createdAt", r."updatedAt"
    FROM "telegram_security"."StudentRegistrationRequest" r
    JOIN "StudentCohort" c ON c."id"=r."cohortId"
    JOIN "StudentCohortSection" s ON s."id"=r."sectionId"
    WHERE r."programmeId"=${DEFAULT_PROGRAMME_ID} AND r."status"=${status}
    ORDER BY r."createdAt" DESC, r."id" DESC LIMIT 51 OFFSET ${offset}
  `;
  return { items: rows.slice(0, 50).map(r => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), emailVerifiedAt: r.emailVerifiedAt?.toISOString() ?? null })), hasMore: rows.length > 50 };
}

export async function registrationRosterCandidates(user: AuthUser, requestId: string, search: string): Promise<TelegramRegistrationRosterCandidate[]> {
  assertReviewer(user);
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; studentId: string | null; email: string | null; userId: string | null; applicantEmail: string | null; emailVerifiedAt: Date | null }>>`
    SELECT st."id", st."name", st."studentId", st."email", st."userId", r."email" AS "applicantEmail", r."emailVerifiedAt"
    FROM "telegram_security"."StudentRegistrationRequest" r
    JOIN "StudentCohortMembership" cm ON cm."cohortId"=r."cohortId" AND cm."exitedAt" IS NULL
    JOIN "StudentCohortSectionMembership" sm ON sm."studentId"=cm."studentId"
      AND sm."cohortId"=r."cohortId" AND sm."sectionId"=r."sectionId" AND sm."exitedAt" IS NULL
    JOIN "Student" st ON st."id"=cm."studentId" AND st."status"='Active'
    WHERE r."id"=${requestId} AND r."programmeId"=${DEFAULT_PROGRAMME_ID} AND (
      (${search} <> '' AND (strpos(lower(st."name"), lower(${search})) > 0 OR st."studentId"=${search}))
      OR (r."officialStudentId" IS NOT NULL AND st."studentId"=r."officialStudentId")
      OR (r."email" IS NOT NULL AND lower(st."email")=lower(r."email"))
      OR lower(st."name")=lower(concat(r."latinFamilyName", ' ', r."latinGivenName"))
    )
    ORDER BY st."name", st."id" LIMIT 50
  `;
  return rows.map(({ userId, applicantEmail, emailVerifiedAt, ...row }) => ({ ...row, hasAccount: Boolean(userId), canActivate: !userId && Boolean(row.studentId) && eligibleRosterEmail(row.email) && Boolean(emailVerifiedAt && applicantEmail && row.email.toLowerCase() === applicantEmail.toLowerCase()) }));
}

/** Approve only a staff-verified, already imported roster record without an existing account.
 * No auto-claim, email overwrite, new academic record or enrollment changes.
 */
export async function reviewRegistration(user: AuthUser, requestId: string, input: TelegramRegistrationReviewInput) {
  assertReviewer(user);
  return prisma.$transaction(async tx => {
    const requests = await tx.$queryRaw<Array<{ telegramUserId: string; status: string; cohortId: string; sectionId: string; email: string | null; emailVerifiedAt: Date | null; careerProfile: unknown }>>`
      SELECT "telegramUserId", "status", "cohortId", "sectionId", "email", "emailVerifiedAt", "careerProfile"
      FROM "telegram_security"."StudentRegistrationRequest"
      WHERE "id"=${requestId} AND "programmeId"=${DEFAULT_PROGRAMME_ID} FOR UPDATE
    `;
    const request = requests[0];
    if (!request) throw new RegistrationReviewError(404, "Registration not found");
    if (request.status !== "PENDING") throw new RegistrationReviewError(409, "Registration is not pending");
    let approvedStudentId: string | null = null;
    if (input.decision === "APPROVE") {
      if (!request.email || !request.emailVerifiedAt) throw new RegistrationReviewError(409, "University email ownership must be verified before approval");
      const candidates = await tx.$queryRaw<Array<{ id: string; name: string; studentId: string | null; email: string | null; userId: string | null }>>`
        SELECT st."id", st."name", st."studentId", st."email", st."userId"
        FROM "Student" st
        JOIN "StudentCohortMembership" cm ON cm."studentId"=st."id" AND cm."exitedAt" IS NULL
        JOIN "StudentCohort" c ON c."id"=cm."cohortId" AND c."status"='Active'
        JOIN "StudentCohortSectionMembership" sm ON sm."studentId"=st."id" AND sm."cohortId"=c."id" AND sm."exitedAt" IS NULL
        JOIN "StudentCohortSection" s ON s."id"=sm."sectionId" AND s."cohortId"=c."id" AND s."active"=TRUE
        WHERE st."id"=${input.studentId} AND st."status"='Active' AND c."id"=${request.cohortId}
          AND s."id"=${request.sectionId} AND c."programmeId"=${DEFAULT_PROGRAMME_ID}
        FOR UPDATE OF st FOR SHARE OF cm,c,sm,s
      `;
      const student = candidates[0];
      if (!student || student.userId || !student.studentId || !eligibleRosterEmail(student.email) || student.email.toLowerCase() !== request.email.toLowerCase()) {
        throw new RegistrationReviewError(409, "Approval requires an active matching roster record, official ID, matching verified institutional email and no existing account");
      }
      const conflict = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "telegram_security"."TelegramIdentity" WHERE "telegramUserId"=${request.telegramUserId}
      `;
      if (conflict.length) throw new RegistrationReviewError(409, "Telegram identity already linked; use recovery");
      const role = await tx.role.findUnique({ where: { slug: "student" }, select: { id: true, active: true } });
      if (!role?.active) throw new RegistrationReviewError(409, "Student role unavailable");
      // Use only staff-verified canonical institutional email, never the applicant's email.
      if (await tx.user.findFirst({ where: { email: { equals: student.email, mode: "insensitive" } } })) {
        throw new RegistrationReviewError(409, "Existing email account; use secure linking or recovery");
      }
      const account = await tx.user.create({ data: { name: student.name, email: student.email } });
      await tx.userRoleAssignment.create({ data: { userId: account.id, roleId: role.id, programmeId: DEFAULT_PROGRAMME_ID } });
      const linked = await tx.student.updateMany({ where: { id: student.id, userId: null }, data: { userId: account.id } });
      if (linked.count !== 1) throw new RegistrationReviewError(409, "Concurrent account conflict");
      await tx.$executeRaw`
        INSERT INTO "telegram_security"."TelegramIdentity" ("id","userId","telegramUserId","linkedAt","lastVerifiedAt","updatedAt")
        VALUES (${randomUUID()},${account.id},${request.telegramUserId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `;
      if (request.careerProfile !== null) {
        const profile = StudentCareerProfileSchema.parse(request.careerProfile);
        await tx.$executeRaw`
          INSERT INTO "StudentCareerProfile" ("studentId","preferences")
          VALUES (${student.id},${JSON.stringify(profile)}::jsonb)
          ON CONFLICT ("studentId") DO NOTHING
        `;
      }
      approvedStudentId = student.id;
    }
    const status = input.decision === "APPROVE" ? "APPROVED" : input.decision === "REJECT" ? "REJECTED" : "NEEDS_CORRECTION";
    await tx.$executeRaw`
      UPDATE "telegram_security"."StudentRegistrationRequest"
      SET "status"=${status}, "approvedStudentId"=${approvedStudentId}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${requestId} AND "programmeId"=${DEFAULT_PROGRAMME_ID}
    `;
    const reviewId=randomUUID();
    await tx.$executeRaw`
      INSERT INTO "telegram_security"."StudentRegistrationReview" ("id","requestId","actorId","decision","reason","notificationState","notificationUpdatedAt")
      VALUES (${reviewId},${requestId},${user.id},${input.decision},${input.reason},'PENDING',CURRENT_TIMESTAMP)
    `;
    return { status, reviewId };
  }, { isolationLevel: "Serializable" });
}
