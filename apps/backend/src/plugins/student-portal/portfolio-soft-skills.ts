import type {
  StudentPortfolioSoftSkillCode,
  StudentPortfolioSoftSkillSummary,
  StudentPortfolioSoftSkillMappingInput,
} from "@dse-pms/shared-types";
import { STUDENT_PORTFOLIO_SOFT_SKILLS } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { PortalAccessError, PortalNotFoundError } from "./service.ts";
import {
  invalidateVerifiedEvidenceAfterMaterialEdit,
  portfolioEvidenceSnapshotHash,
  studentPortfolioVerificationService,
} from "./portfolio-verification.ts";

async function studentIdForUser(userId: string): Promise<string> {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true, status: true, email: true } });
  if (!student || student.status !== "Active" || !student.email) {
    throw new PortalAccessError("No active student portal profile is linked to this account");
  }
  return student.id;
}

export async function softSkillsForStudentId(studentId: string, publicOnly = false): Promise<StudentPortfolioSoftSkillSummary[]> {
  const rows = await prisma.$queryRaw<Array<{
    skillCode: StudentPortfolioSoftSkillCode;
    evidenceId: string;
    title: string;
    origin: string;
    isPublic: boolean;
    sourceOfferingId: string | null;
  }>>`
    SELECT m."skillCode", e."id" AS "evidenceId", e."title", e."origin"::text AS "origin",
           e."isPublic", e."sourceOfferingId"
    FROM "StudentPortfolioEvidenceSoftSkill" m
    JOIN "StudentPortfolioEvidence" e ON e."id" = m."evidenceId"
    WHERE e."studentId" = ${studentId}
      AND (${publicOnly} = false OR e."isPublic" = true)
    ORDER BY e."updatedAt" DESC
  `;

  const summaries = await Promise.all(STUDENT_PORTFOLIO_SOFT_SKILLS.map(async (skill) => {
    const evidenceRows = rows.filter((row) => row.skillCode === skill.code);
    const evidence = await Promise.all(evidenceRows.map(async (row) => ({
      id: row.evidenceId,
      title: row.title,
      origin: row.origin.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase() as any,
      public: row.isPublic,
      sourceLabel: row.sourceOfferingId ? "PMS-linked academic evidence" : "Student-provided evidence",
      verification: await studentPortfolioVerificationService.summary(row.evidenceId),
    })));
    const verifiedExperienceCount = evidence.filter((item) => item.verification.state === "verified").length;
    return {
      ...skill,
      evidenceCount: evidence.length,
      verifiedExperienceCount,
      status: evidence.length === 0
        ? "not_yet_evidenced" as const
        : verifiedExperienceCount >= 2
          ? "demonstrated" as const
          : "developing" as const,
      evidence,
    };
  }));
  return summaries;
}

export const studentPortfolioSoftSkillService = {
  async list(userId: string): Promise<StudentPortfolioSoftSkillSummary[]> {
    return softSkillsForStudentId(await studentIdForUser(userId));
  },

  async updateEvidenceMapping(userId: string, evidenceId: string, input: StudentPortfolioSoftSkillMappingInput) {
    const studentId = await studentIdForUser(userId);
    const evidence = await prisma.studentPortfolioEvidence.findFirst({ where: { id: evidenceId, studentId }, select: { id: true } });
    if (!evidence) throw new PortalNotFoundError("Portfolio evidence was not found");
    const beforeHash = await portfolioEvidenceSnapshotHash(evidenceId);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM "StudentPortfolioEvidenceSoftSkill" WHERE "evidenceId" = ${evidenceId}`;
      for (const skillCode of input.skillCodes) {
        await tx.$executeRaw`
          INSERT INTO "StudentPortfolioEvidenceSoftSkill" ("evidenceId", "skillCode", "createdAt")
          VALUES (${evidenceId}, ${skillCode}, CURRENT_TIMESTAMP)
        `;
      }
    });
    await invalidateVerifiedEvidenceAfterMaterialEdit(evidenceId, beforeHash);
    return { skillCodes: input.skillCodes };
  },

  async evidenceMapping(userId: string, evidenceId: string): Promise<StudentPortfolioSoftSkillCode[]> {
    const studentId = await studentIdForUser(userId);
    const evidence = await prisma.studentPortfolioEvidence.findFirst({ where: { id: evidenceId, studentId }, select: { id: true } });
    if (!evidence) throw new PortalNotFoundError("Portfolio evidence was not found");
    const rows = await prisma.$queryRaw<Array<{ skillCode: StudentPortfolioSoftSkillCode }>>`
      SELECT "skillCode" FROM "StudentPortfolioEvidenceSoftSkill" WHERE "evidenceId" = ${evidenceId} ORDER BY "skillCode"
    `;
    return rows.map((row) => row.skillCode);
  },
};
