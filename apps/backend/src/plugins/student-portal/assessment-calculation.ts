import { MARKING_SCHEME_HASH_PREFIX } from "../../core/academic/rubric-context.ts";

export type GradeAssessment = {
  id: string;
  status: string;
  weight: number | null;
  cloCodes: string[];
  criterionCloMappings?: Array<{ criterionId: string; rubricId: string; rubricContentHash: string; cloCode: string }>;
};

export type PublishedAssessmentResult = {
  assessmentItemId: string;
  score: number;
  maxScore: number;
};

export type CourseGradeContribution = {
  assessmentItemId: string;
  rawPercentage: number;
  courseGradeWeight: number;
  weightedContribution: number;
};

export type CourseGradeSummary = {
  totalGrade: number | null;
  completedWeight: number;
  configuredWeight: number;
  complete: boolean;
  contributions: CourseGradeContribution[];
};

/**
 * Local course-grade calculation only. A non-null positive `weight` is the
 * explicit signal that an active assessment contributes to the course grade.
 * CLO mappings are deliberately ignored here.
 */
export function calculateCourseGrade(
  assessments: GradeAssessment[],
  results: PublishedAssessmentResult[],
): CourseGradeSummary {
  const gradeAssessments = assessments.filter(
    (assessment) =>
      assessment.status === "Active" &&
      assessment.weight !== null &&
      assessment.weight > 0,
  );
  const configuredWeight = gradeAssessments.reduce(
    (sum, assessment) => sum + (assessment.weight ?? 0),
    0,
  );
  const resultByAssessment = new Map(
    results.map((result) => [result.assessmentItemId, result]),
  );
  const contributions = gradeAssessments.flatMap((assessment) => {
    const result = resultByAssessment.get(assessment.id);
    if (!result || result.maxScore <= 0) return [];
    const rawPercentage = (result.score / result.maxScore) * 100;
    const courseGradeWeight = assessment.weight ?? 0;
    return [{
      assessmentItemId: assessment.id,
      rawPercentage: Math.round(rawPercentage * 100) / 100,
      courseGradeWeight,
      weightedContribution:
        Math.round(rawPercentage * courseGradeWeight) / 100,
    }];
  });
  const completedWeight = contributions.reduce(
    (sum, contribution) => sum + contribution.courseGradeWeight,
    0,
  );
  const complete =
    Math.round(configuredWeight * 100) === 10000 &&
    Math.round(completedWeight * 100) === Math.round(configuredWeight * 100);
  return {
    totalGrade: complete
      ? Math.round(
          contributions.reduce(
            (sum, contribution) => sum + contribution.weightedContribution,
            0,
          ) * 100,
        ) / 100
      : null,
    completedWeight,
    configuredWeight,
    complete,
    contributions,
  };
}

export type CriterionCloEvidenceInput = {
  assessmentItemId: string;
  rubricId: string;
  criterionId: string;
  criterionName: string;
  rubricContentHash: string;
  score: number;
  maxScore: number;
  cloCodes: string[];
};

export type CloEvidenceTrace = {
  assessmentItemId: string;
  rawPercentage: number;
  source: "assessment" | "criterion";
  rubricId?: string;
  criterionId?: string;
  criterionName?: string;
  score?: number;
  maxScore?: number;
  rubricContentHash?: string;
};

export type CloAchievementCalculation = {
  percentage: number | null;
  evidence: CloEvidenceTrace[];
};

/**
 * Outcome calculation only. Evidence is included solely when an assessment is
 * explicitly mapped to the requested CLO. Local course-grade weights are never
 * read or reused by this function.
 */
export function calculateCloEvidence(
  cloCode: string,
  assessments: GradeAssessment[],
  results: PublishedAssessmentResult[],
  criterionEvidence: CriterionCloEvidenceInput[] = [],
): CloAchievementCalculation {
  const resultByAssessment = new Map(
    results.map((result) => [result.assessmentItemId, result]),
  );
  const schemeAssessments = new Map(assessments.filter((assessment) =>
    assessment.criterionCloMappings?.some((mapping) => mapping.rubricContentHash.startsWith(MARKING_SCHEME_HASH_PREFIX))
  ).map((assessment) => [assessment.id, assessment]));
  const schemeTotals = new Map<string, number>();
  const completeSchemeEvidence: CriterionCloEvidenceInput[] = [];
  for (const assessment of schemeAssessments.values()) {
    if (assessment.status !== "Active" || !assessment.cloCodes.includes(cloCode) || !resultByAssessment.has(assessment.id)) continue;
    const expected = (assessment.criterionCloMappings ?? []).filter((mapping) => mapping.cloCode === cloCode);
    const rows = criterionEvidence.filter((row) => row.assessmentItemId === assessment.id && row.cloCodes.includes(cloCode));
    if (!expected.length || rows.length !== expected.length || !expected.every((mapping) => rows.some((row) =>
      row.criterionId === mapping.criterionId && row.rubricId === mapping.rubricId && row.rubricContentHash === mapping.rubricContentHash &&
      Number.isFinite(row.score) && Number.isFinite(row.maxScore) && row.maxScore > 0 && row.score >= 0 && row.score <= row.maxScore
    ))) continue;
    const maximum = rows.reduce((sum, row) => sum + row.maxScore, 0);
    schemeTotals.set(assessment.id, Math.round(rows.reduce((sum, row) => sum + row.score, 0) / maximum * 10000) / 100);
    completeSchemeEvidence.push(...rows);
  }
  const criterionForClo = [
    ...criterionEvidence.filter((item) => !schemeAssessments.has(item.assessmentItemId) && !item.rubricContentHash.startsWith(MARKING_SCHEME_HASH_PREFIX) && item.cloCodes.includes(cloCode) && item.maxScore > 0),
    ...completeSchemeEvidence,
  ];
  const criterionAssessmentIds = new Set(
    criterionForClo.map((item) => item.assessmentItemId),
  );
  const criterionTraces: CloEvidenceTrace[] = criterionForClo.map((item) => ({
    assessmentItemId: item.assessmentItemId,
    rawPercentage: Math.round((item.score / item.maxScore) * 10000) / 100,
    source: "criterion",
    rubricId: item.rubricId,
    criterionId: item.criterionId,
    criterionName: item.criterionName,
    score: item.score,
    maxScore: item.maxScore,
    rubricContentHash: item.rubricContentHash,
  }));
  const assessmentTraces: CloEvidenceTrace[] = assessments
    .filter(
      (assessment) =>
        assessment.status === "Active" &&
        assessment.cloCodes.includes(cloCode) &&
        !criterionAssessmentIds.has(assessment.id) && !schemeAssessments.has(assessment.id),
    )
    .flatMap((assessment) => {
      const result = resultByAssessment.get(assessment.id);
      if (!result || result.maxScore <= 0) return [];
      return [{
        assessmentItemId: assessment.id,
        rawPercentage: Math.round((result.score / result.maxScore) * 10000) / 100,
        source: "assessment" as const,
      }];
    });
  const evidence = [...criterionTraces, ...assessmentTraces];
  const aggregationItems = [...evidence.filter((item) => !schemeAssessments.has(item.assessmentItemId)).map((item) => item.rawPercentage), ...schemeTotals.values()];
  return {
    percentage: aggregationItems.length
      ? Math.round(
          aggregationItems.reduce((sum, item) => sum + item, 0) /
            aggregationItems.length,
        )
      : null,
    evidence,
  };
}
