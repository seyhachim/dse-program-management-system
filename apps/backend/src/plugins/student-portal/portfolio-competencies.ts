import type {
  StudentPortfolioCompetencySummary,
  StudentPortfolioCompetencyEvidence,
  StudentPortfolioEvidenceStrength,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { PortalAccessError } from "./service.ts";
import { studentPortfolioVerificationService } from "./portfolio-verification.ts";

const RULE_VERSION = "portfolio-competency-v1" as const;

async function studentIdForUser(userId: string): Promise<string> {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true, status: true, email: true } });
  if (!student || student.status !== "Active" || !student.email) {
    throw new PortalAccessError("No active student portal profile is linked to this account");
  }
  return student.id;
}

type AcademicEvidenceRow = {
  id: string;
  title: string;
  sourceOfferingId: string;
  sourceCourseSpecId: string;
  sourceAssessmentItemId: string;
  courseCode: string;
  courseTitle: string;
  cloCodes: string[];
};

async function eligibleAcademicEvidence(studentId: string, publicOnly: boolean): Promise<AcademicEvidenceRow[]> {
  return prisma.$queryRaw<AcademicEvidenceRow[]>`
    SELECT e."id", e."title", e."sourceOfferingId", e."sourceCourseSpecId", e."sourceAssessmentItemId",
           c."code" AS "courseCode", c."title" AS "courseTitle", a."cloCodes"
    FROM "StudentPortfolioEvidence" e
    JOIN "Enrollment" en ON en."studentId" = e."studentId" AND en."offeringId" = e."sourceOfferingId"
    JOIN "Offering" o ON o."id" = e."sourceOfferingId" AND o."courseSpecId" = e."sourceCourseSpecId"
    JOIN "Course" c ON c."id" = o."courseId"
    JOIN "CourseSpec" cs ON cs."id" = e."sourceCourseSpecId" AND cs."reviewStatus" = 'Approved'
    JOIN "CourseSpecAssessmentItem" a
      ON a."courseSpecId" = e."sourceCourseSpecId" AND a."id" = e."sourceAssessmentItemId" AND a."status" = 'Active'
    WHERE e."studentId" = ${studentId}
      AND e."sourceType" = 'CourseAssessment'
      AND (${publicOnly} = false OR e."isPublic" = true)
    ORDER BY e."updatedAt" DESC
  `;
}

function cloCode(order: number): string {
  return `CLO${order + 1}`;
}

export async function competenciesForStudentId(studentId: string, publicOnly = false): Promise<StudentPortfolioCompetencySummary[]> {
  const competencies = await prisma.programCompetency.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
    include: {
      ploLinks: {
        include: { plo: true },
      },
    },
  });
  const evidenceRows = await eligibleAcademicEvidence(studentId, publicOnly);

  const cloRows = evidenceRows.length
    ? await prisma.courseSpecClo.findMany({
        where: { courseSpecId: { in: [...new Set(evidenceRows.map((item) => item.sourceCourseSpecId))] } },
        select: { courseSpecId: true, order: true, mappedPlos: true, status: true },
      })
    : [];

  return Promise.all(competencies.map(async (competency) => {
    const linkedPloCodes = competency.ploLinks.filter((link) => link.plo.active).map((link) => link.plo.code);
    const evidence: StudentPortfolioCompetencyEvidence[] = [];

    for (const row of evidenceRows) {
      const mappedClos = cloRows.filter((clo) =>
        clo.courseSpecId === row.sourceCourseSpecId &&
        clo.status === "Active" &&
        row.cloCodes.includes(cloCode(clo.order)),
      );
      const matchedPloCodes = [...new Set(mappedClos.flatMap((clo) => clo.mappedPlos).filter((code) => linkedPloCodes.includes(code)))];
      if (matchedPloCodes.length === 0) continue;
      const verification = await studentPortfolioVerificationService.summary(row.id);
      const strength: StudentPortfolioEvidenceStrength = verification.state === "verified" ? "practiced" : "supporting";
      const primaryClo = mappedClos.find((clo) => clo.mappedPlos.some((code) => matchedPloCodes.includes(code)));
      evidence.push({
        evidenceId: row.id,
        evidenceTitle: row.title,
        courseCode: row.courseCode,
        courseTitle: row.courseTitle,
        cloCode: primaryClo ? cloCode(primaryClo.order) : "CLO",
        ploCodes: matchedPloCodes,
        strength,
        verification,
      });
    }

    const verified = evidence.filter((item) => item.verification.state === "verified");
    const coveredPloCodes = new Set(verified.flatMap((item) => item.ploCodes));
    const distinctCourses = new Set(verified.map((item) => item.courseCode));
    const allLinkedPlosCovered = linkedPloCodes.length > 0 && linkedPloCodes.every((code) => coveredPloCodes.has(code));

    // v1 rule is deliberately conservative and not count-only:
    // - Demonstrated: verified evidence covers every active competency PLO AND spans >= 2 distinct courses.
    // - Practiced: at least one verified approved academic evidence item.
    // - Supporting: eligible approved academic evidence exists but is not currently verified.
    // Portfolio state never writes official PLO/CLO attainment or QA snapshots.
    const status = allLinkedPlosCovered && distinctCourses.size >= 2
      ? "demonstrated" as const
      : verified.length > 0
        ? "practiced" as const
        : evidence.length > 0
          ? "supporting" as const
          : "not_yet_evidenced" as const;

    return {
      competencyId: competency.id,
      code: competency.code,
      name: competency.name,
      description: competency.description,
      status,
      linkedPloCodes,
      ruleVersion: RULE_VERSION,
      evidence,
    };
  }));
}

export const studentPortfolioCompetencyService = {
  async list(userId: string): Promise<StudentPortfolioCompetencySummary[]> {
    return competenciesForStudentId(await studentIdForUser(userId));
  },
};
