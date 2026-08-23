import type { StudentPortfolioVerificationInboxItem } from "@dse-pms/shared-types";
import type { AuthUser } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { studentPortfolioVerificationService } from "./portfolio-verification.ts";

export const studentPortfolioVerificationInboxService = {
  async list(actor: AuthUser): Promise<StudentPortfolioVerificationInboxItem[]> {
    const rows = await prisma.$queryRaw<Array<{
      evidenceId: string;
      studentName: string;
      title: string;
      summary: string;
      role: string;
      contribution: string;
      courseCode: string | null;
      assessmentName: string | null;
    }>>`
      SELECT DISTINCT e."id" AS "evidenceId", s."name" AS "studentName", e."title", e."summary", e."role", e."contribution",
             c."code" AS "courseCode", a."name" AS "assessmentName"
      FROM "StudentPortfolioEvidence" e
      JOIN "Student" s ON s."id" = e."studentId"
      LEFT JOIN "Offering" o ON o."id" = e."sourceOfferingId"
      LEFT JOIN "Course" c ON c."id" = o."courseId"
      LEFT JOIN "CourseSpecAssessmentItem" a
        ON a."courseSpecId" = e."sourceCourseSpecId" AND a."id" = e."sourceAssessmentItemId"
      LEFT JOIN "OfferingCoLecturer" co ON co."offeringId" = o."id"
      LEFT JOIN "StudentPortfolioSupervisorRelationship" sr
        ON sr."studentId" = e."studentId" AND sr."supervisorUserId" = ${actor.id} AND sr."status" = 'Approved'
      WHERE s."status" = 'Active'
        AND (
          (${actor.roles.includes("lecturer")} = true AND (o."lecturerId" = ${actor.id} OR co."lecturerId" = ${actor.id}))
          OR sr."id" IS NOT NULL
        )
      ORDER BY e."title" ASC
    `;

    return Promise.all(rows.map(async (row) => ({
      evidenceId: row.evidenceId,
      studentName: row.studentName,
      title: row.title,
      summary: row.summary,
      role: row.role,
      contribution: row.contribution,
      courseLabel: row.courseCode && row.assessmentName ? `${row.courseCode} · ${row.assessmentName}` : row.courseCode,
      verification: await studentPortfolioVerificationService.summary(row.evidenceId),
    })));
  },
};
