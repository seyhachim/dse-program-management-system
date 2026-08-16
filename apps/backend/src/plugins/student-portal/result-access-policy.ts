import type { PortalCourseDetail } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { PortalAccessError, PortalNotFoundError } from "./service.ts";

type PolicyRow = {
  offeringId: string;
  requireSurveyBeforeResults: boolean;
};

export type ProvisionalResultAccess = {
  requireSurveyBeforeResults: boolean;
  surveyCompleted: boolean;
  canViewProvisionalResults: boolean;
};

export async function getOfferingResultAccessPolicy(offeringId: string): Promise<PolicyRow> {
  const rows = await prisma.$queryRaw<PolicyRow[]>`
    SELECT "offeringId", "requireSurveyBeforeResults"
    FROM "OfferingResultAccessPolicy"
    WHERE "offeringId" = ${offeringId}
  `;
  return rows[0] ?? { offeringId, requireSurveyBeforeResults: false };
}

export async function setOfferingResultAccessPolicy(
  offeringId: string,
  actorId: string,
  programmeWide: boolean,
  requireSurveyBeforeResults: boolean,
): Promise<PolicyRow> {
  const offering = await prisma.offering.findUnique({
    where: { id: offeringId },
    include: { coLecturers: { select: { lecturerId: true } } },
  });
  if (!offering) throw new PortalNotFoundError("Offering not found");

  const assigned = offering.lecturerId === actorId
    || offering.coLecturers.some((item) => item.lecturerId === actorId);
  if (!programmeWide && !assigned) {
    throw new PortalAccessError("You are not assigned to this offering");
  }

  const rows = await prisma.$queryRaw<PolicyRow[]>`
    INSERT INTO "OfferingResultAccessPolicy" (
      "offeringId", "requireSurveyBeforeResults", "updatedAt"
    ) VALUES (${offeringId}, ${requireSurveyBeforeResults}, CURRENT_TIMESTAMP)
    ON CONFLICT ("offeringId") DO UPDATE SET
      "requireSurveyBeforeResults" = EXCLUDED."requireSurveyBeforeResults",
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "offeringId", "requireSurveyBeforeResults"
  `;
  return rows[0]!;
}

export async function applyProvisionalResultAccessPolicy(
  offeringId: string,
  detail: PortalCourseDetail,
): Promise<PortalCourseDetail & { provisionalResultAccess: ProvisionalResultAccess }> {
  const policy = await getOfferingResultAccessPolicy(offeringId);
  const surveyCompleted = detail.feedbackSubmitted;
  const canViewProvisionalResults = !policy.requireSurveyBeforeResults || surveyCompleted;
  const provisionalResultAccess = {
    requireSurveyBeforeResults: policy.requireSurveyBeforeResults,
    surveyCompleted,
    canViewProvisionalResults,
  };

  if (canViewProvisionalResults) {
    return { ...detail, provisionalResultAccess };
  }

  return {
    ...detail,
    assessments: detail.assessments.map((assessment) => ({ ...assessment, result: null })),
    totalCourseGrade: null,
    courseGradeComplete: false,
    completedGradeWeight: 0,
    achievements: detail.achievements.map((achievement) => ({
      ...achievement,
      percentage: null,
      status: "not-enough-evidence",
      evidenceCount: 0,
      evidence: [],
    })),
    overallAchievement: null,
    provisionalResultAccess,
  };
}
