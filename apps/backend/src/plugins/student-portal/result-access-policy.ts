import type {
  OfferingResultAccessPolicy,
  PortalCloAchievement,
  PortalCourseDetail,
  ProvisionalResultAccess,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { PortalAccessError, PortalNotFoundError } from "./service.ts";

async function assertPolicyManager(
  offeringId: string,
  actorId: string,
  programmeWide: boolean,
): Promise<void> {
  const offering = await prisma.offering.findUnique({
    where: { id: offeringId },
    select: {
      lecturerId: true,
      coLecturers: { select: { lecturerId: true } },
    },
  });
  if (!offering) throw new PortalNotFoundError("Offering not found");

  const assigned = offering.lecturerId === actorId
    || offering.coLecturers.some((item) => item.lecturerId === actorId);
  if (!programmeWide && !assigned) {
    throw new PortalAccessError("You are not assigned to this offering");
  }
}

async function policyForOffering(offeringId: string): Promise<OfferingResultAccessPolicy> {
  const policy = await prisma.offeringResultAccessPolicy.findUnique({
    where: { offeringId },
    select: { offeringId: true, requireSurveyBeforeResults: true },
  });
  return policy ?? { offeringId, requireSurveyBeforeResults: false };
}

export async function getOfferingResultAccessPolicy(
  offeringId: string,
  actorId: string,
  programmeWide: boolean,
): Promise<OfferingResultAccessPolicy> {
  await assertPolicyManager(offeringId, actorId, programmeWide);
  return policyForOffering(offeringId);
}

export async function setOfferingResultAccessPolicy(
  offeringId: string,
  actorId: string,
  programmeWide: boolean,
  requireSurveyBeforeResults: boolean,
): Promise<OfferingResultAccessPolicy> {
  await assertPolicyManager(offeringId, actorId, programmeWide);
  return prisma.offeringResultAccessPolicy.upsert({
    where: { offeringId },
    create: { offeringId, requireSurveyBeforeResults },
    update: { requireSurveyBeforeResults },
    select: { offeringId: true, requireSurveyBeforeResults: true },
  });
}

function achievementStatus(percentage: number | null): PortalCloAchievement["status"] {
  if (percentage === null) return "not-enough-evidence";
  if (percentage >= 70) return "achieved";
  if (percentage >= 50) return "developing";
  return "needs-attention";
}

function filterAchievements(
  achievements: PortalCloAchievement[],
  hiddenAssessmentIds: Set<string>,
): PortalCloAchievement[] {
  return achievements.map((achievement) => {
    const evidence = achievement.evidence.filter(
      (item) => !hiddenAssessmentIds.has(item.assessmentItemId),
    );
    const percentage = evidence.length
      ? Math.round(
          evidence.reduce((sum, item) => sum + item.rawPercentage, 0) / evidence.length,
        )
      : null;
    return {
      ...achievement,
      percentage,
      status: achievementStatus(percentage),
      evidenceCount: evidence.length,
      evidence,
    };
  });
}

export async function applyProvisionalResultAccessPolicy(
  offeringId: string,
  detail: PortalCourseDetail,
): Promise<PortalCourseDetail> {
  const policy = await policyForOffering(offeringId);
  const surveyCompleted = detail.feedbackSubmitted;
  const canViewProvisionalResults = !policy.requireSurveyBeforeResults || surveyCompleted;

  if (canViewProvisionalResults) {
    return {
      ...detail,
      provisionalResultAccess: {
        requireSurveyBeforeResults: policy.requireSurveyBeforeResults,
        surveyCompleted,
        canViewProvisionalResults: true,
        hiddenProvisionalAssessmentCount: 0,
      },
    };
  }

  const lifecycleRows = await prisma.assessmentResult.findMany({
    where: {
      enrollmentId: detail.enrollmentId,
      publishedAt: { not: null },
    },
    select: {
      assessmentItemId: true,
      finalizedAt: true,
    },
  });
  const finalizedByAssessment = new Map(
    lifecycleRows.map((row) => [row.assessmentItemId, row.finalizedAt !== null]),
  );
  const hiddenAssessmentIds = new Set(
    detail.assessments.flatMap((assessment) =>
      assessment.result && finalizedByAssessment.get(assessment.id) !== true
        ? [assessment.id]
        : [],
    ),
  );

  const assessments = detail.assessments.map((assessment) =>
    hiddenAssessmentIds.has(assessment.id)
      ? { ...assessment, result: null }
      : assessment,
  );
  const visibleGradeAssessments = assessments.filter(
    (assessment) => assessment.countsTowardGrade && assessment.result,
  );
  const completedGradeWeight = visibleGradeAssessments.reduce(
    (sum, assessment) => sum + (assessment.courseGradeWeight ?? 0),
    0,
  );
  const courseGradeComplete =
    Math.round(detail.configuredGradeWeight * 100) === 10000
    && Math.round(completedGradeWeight * 100) === Math.round(detail.configuredGradeWeight * 100);
  const totalCourseGrade = courseGradeComplete
    ? Math.round(
        visibleGradeAssessments.reduce(
          (sum, assessment) => sum + (assessment.result?.weightedCourseContribution ?? 0),
          0,
        ) * 100,
      ) / 100
    : null;
  const achievements = filterAchievements(detail.achievements, hiddenAssessmentIds);
  const measured = achievements.flatMap((item) => item.percentage === null ? [] : [item.percentage]);
  const provisionalResultAccess: ProvisionalResultAccess = {
    requireSurveyBeforeResults: true,
    surveyCompleted: false,
    canViewProvisionalResults: false,
    hiddenProvisionalAssessmentCount: hiddenAssessmentIds.size,
  };

  return {
    ...detail,
    assessments,
    totalCourseGrade,
    courseGradeComplete,
    completedGradeWeight,
    achievements,
    overallAchievement: measured.length
      ? Math.round(measured.reduce((sum, item) => sum + item, 0) / measured.length)
      : null,
    provisionalResultAccess,
  };
}
