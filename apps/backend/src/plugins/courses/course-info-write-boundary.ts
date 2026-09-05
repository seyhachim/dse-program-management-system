export type ProtectedCourseInfoWrite = {
  attemptedPrerequisiteWrite: boolean;
  values: {
    description?: string;
    prerequisites?: string;
  };
};

/**
 * Protect the Course Specification Course Information write boundary.
 *
 * The existing normalized CourseSpec service still expects prerequisites when it
 * updates the version snapshot, so carry forward the authoritative Course value
 * internally. A caller-supplied prerequisites key is separately reported and
 * rejected by the service wrapper. This prevents the CourseSpec endpoint from
 * becoming a second Course Management write path.
 */
export function protectCourseInfoWrite(
  values: unknown,
  currentPrerequisites: string | null,
): ProtectedCourseInfoWrite {
  const raw =
    values !== null && typeof values === "object" && !Array.isArray(values)
      ? (values as Record<string, unknown>)
      : {};

  return {
    attemptedPrerequisiteWrite: Object.prototype.hasOwnProperty.call(
      raw,
      "prerequisites",
    ),
    values: {
      description:
        typeof raw.description === "string" ? raw.description : undefined,
      prerequisites: currentPrerequisites ?? undefined,
    },
  };
}
