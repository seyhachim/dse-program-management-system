export type GradeAssessment = {
  id: string;
  status: string;
  weight: number | null;
  cloCodes: string[];
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

export type CloEvidenceTrace = {
  assessmentItemId: string;
  rawPercentage: number;
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
): CloAchievementCalculation {
  const resultByAssessment = new Map(
    results.map((result) => [result.assessmentItemId, result]),
  );
  const evidence = assessments
    .filter(
      (assessment) =>
        assessment.status === "Active" &&
        assessment.cloCodes.includes(cloCode),
    )
    .flatMap((assessment) => {
      const result = resultByAssessment.get(assessment.id);
      if (!result || result.maxScore <= 0) return [];
      return [{
        assessmentItemId: assessment.id,
        rawPercentage:
          Math.round((result.score / result.maxScore) * 10000) / 100,
      }];
    });
  return {
    percentage: evidence.length
      ? Math.round(
          evidence.reduce((sum, item) => sum + item.rawPercentage, 0) /
            evidence.length,
        )
      : null,
    evidence,
  };
}
