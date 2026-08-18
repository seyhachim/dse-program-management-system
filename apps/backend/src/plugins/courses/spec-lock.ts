import type { CourseSpecReviewStatus } from "@prisma/client";

export const EDITABLE_COURSE_SPEC_STATUSES = [
  "Draft",
  "ChangesRequested",
] as const satisfies readonly CourseSpecReviewStatus[];

export class CourseSpecLockedError extends Error {
  readonly code = "COURSE_SPEC_LOCKED";

  constructor(readonly reviewStatus: CourseSpecReviewStatus) {
    super(
      `Course specification is locked while its review status is ${reviewStatus}`,
    );
    this.name = "CourseSpecLockedError";
  }
}

export function assertCourseSpecEditable(
  reviewStatus: CourseSpecReviewStatus,
): void {
  if (
    !EDITABLE_COURSE_SPEC_STATUSES.includes(
      reviewStatus as (typeof EDITABLE_COURSE_SPEC_STATUSES)[number],
    )
  ) {
    throw new CourseSpecLockedError(reviewStatus);
  }
}
