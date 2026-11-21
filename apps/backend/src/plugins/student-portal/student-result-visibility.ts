/**
 * Shared release rule for student-facing aggregate and course projections.
 * Publication is a prerequisite for callers; this function only checks
 * whether the optional final-survey gate hides a *published* provisional mark.
 */
export function isPublishedResultVisibleUnderSurveyGate(
  requireSurveyBeforeResults: boolean,
  surveyCompleted: boolean,
  finalized: boolean,
): boolean {
  return !requireSurveyBeforeResults || surveyCompleted || finalized;
}
