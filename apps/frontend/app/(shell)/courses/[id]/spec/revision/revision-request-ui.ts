import {
  type CourseSpecRevisionImpact,
  type CourseSpecRevisionType,
  recommendedCourseSpecRevisionType,
} from "@dse-pms/shared-types";

export type RevisionRequestUiDecision = {
  recommendedRevisionType: CourseSpecRevisionType;
  showOverrideJustification: boolean;
};

/**
 * Pure presentation decision used by the revision workspace. Keeping this
 * outside React lets us regression-test the exact Major recommendation and
 * override-visibility behavior without adding a browser-test dependency.
 */
export function revisionRequestUiDecision(
  impact: CourseSpecRevisionImpact,
  proposedRevisionType: CourseSpecRevisionType,
): RevisionRequestUiDecision {
  const recommendedRevisionType = recommendedCourseSpecRevisionType(impact);
  return {
    recommendedRevisionType,
    showOverrideJustification:
      recommendedRevisionType === "Major" && proposedRevisionType === "Minor",
  };
}
