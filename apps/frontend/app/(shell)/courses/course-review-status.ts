export type CourseReviewStatusValue = string | null | undefined;

/**
 * User-facing label for the Course Specification review state shown in the
 * Courses table. An explicit null means the backend confirmed that the course
 * has no CourseSpec; undefined remains backward-compatible with older API
 * responses that omitted the field during the #470 rollout.
 */
export function courseReviewStatusLabel(
  status: CourseReviewStatusValue,
): string {
  if (status === null) return "No Course Spec";
  if (status === "ChangesRequested") return "Changes Requested";
  return status ?? "Draft";
}
