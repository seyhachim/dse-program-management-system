import type { CurriculumCourseSpecBindings } from "@dse-pms/shared-types";

export function resolveBoundDocumentCode(bindings: CurriculumCourseSpecBindings, context: {
  courseId: string;
  versionId: string;
  curriculumVersionId: string;
  placementId: string;
}): string {
  if (bindings.versionId !== context.curriculumVersionId ||
      !["Approved", "Active", "Superseded"].includes(bindings.versionStatus)) {
    throw new Error("Official curriculum context is not approved");
  }
  const match = bindings.bindings.find((row) => row.placementId === context.placementId &&
    row.courseId === context.courseId && row.linkedVersion?.id === context.versionId &&
    row.linkedVersion.courseId === context.courseId &&
    row.eligibleVersions.some((spec) => spec.id === context.versionId && spec.courseId === context.courseId));
  if (!match?.courseCode.trim()) throw new Error("CourseSpec does not match the selected curriculum placement");
  return match.courseCode;
}
