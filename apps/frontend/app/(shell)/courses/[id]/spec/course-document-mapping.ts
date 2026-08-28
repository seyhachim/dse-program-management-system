export type CourseDocumentWeekForMapping = {
  cloCodes: string[];
  sltHours: string;
};

export type CourseDocumentAssessmentForMapping = {
  cloCodes: string[];
  totalSltHours: number;
};

function positiveNumber(value: string | number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function allocatedShare(
  cloCode: string,
  cloCodes: readonly string[],
  sltHours: string | number,
): number {
  const linkedCodes = [...new Set(cloCodes.filter(Boolean))];
  if (!linkedCodes.includes(cloCode) || linkedCodes.length === 0) return 0;
  return positiveNumber(sltHours) / linkedCodes.length;
}

/**
 * Derive the delivered course-content SLT allocated to one CLO.
 *
 * A week linked to multiple CLOs is divided equally across those CLOs. This is
 * the same deterministic allocation rule used by the Weekly Plan dashboard, so
 * the document never double-counts a shared week.
 */
export function courseDocumentCloLearningSltHours(
  cloCode: string,
  weeks: readonly CourseDocumentWeekForMapping[],
): number {
  return weeks.reduce(
    (sum, week) => sum + allocatedShare(cloCode, week.cloCodes, week.sltHours),
    0,
  );
}

/**
 * Derive assessment SLT allocated to one CLO.
 *
 * Assessment SLT is persisted separately from grade weight. When an assessment
 * directly measures multiple CLOs, divide its SLT equally across those CLOs so
 * the course total is conserved and no CLO receives duplicated hours.
 */
export function courseDocumentCloAssessmentSltHours(
  cloCode: string,
  assessments: readonly CourseDocumentAssessmentForMapping[],
): number {
  return assessments.reduce(
    (sum, assessment) =>
      sum + allocatedShare(cloCode, assessment.cloCodes, assessment.totalSltHours),
    0,
  );
}

/**
 * Derive total learning + assessment SLT represented by one CLO.
 *
 * Older Course Specs can still carry a CLO-level SLT snapshot, so preserve that
 * only as a compatibility fallback when no current Weekly Plan or Assessment
 * SLT contributes to this CLO.
 *
 * This helper is read-only: it never rewrites CLO, Weekly Plan, or Assessment
 * source data.
 */
export function courseDocumentCloSltHours(
  cloCode: string,
  weeks: readonly CourseDocumentWeekForMapping[],
  assessments: readonly CourseDocumentAssessmentForMapping[],
  fallbackSltHours = "",
): string {
  const learningSlt = courseDocumentCloLearningSltHours(cloCode, weeks);
  const assessmentSlt = courseDocumentCloAssessmentSltHours(
    cloCode,
    assessments,
  );
  const total = learningSlt + assessmentSlt;

  return total > 0 ? String(total) : fallbackSltHours;
}
