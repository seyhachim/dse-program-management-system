import type { CourseSpecReviewStatus } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";

type CourseRow = { id: string };
type CourseSpecStatusRow = {
  courseId: string;
  versionMajor: number;
  versionMinor: number;
  reviewStatus: CourseSpecReviewStatus;
};

function isNewerSpec(
  candidate: CourseSpecStatusRow,
  current: CourseSpecStatusRow,
): boolean {
  return (
    candidate.versionMajor > current.versionMajor ||
    (candidate.versionMajor === current.versionMajor &&
      candidate.versionMinor > current.versionMinor)
  );
}

/**
 * Attach the persisted review status of each course's latest academic CourseSpec
 * version. Courses without any CourseSpec are explicit `null`, never an inferred
 * Draft.
 */
export function projectLatestCourseSpecReviewStatus<T extends CourseRow>(
  courses: readonly T[],
  specs: readonly CourseSpecStatusRow[],
): Array<T & { reviewStatus: CourseSpecReviewStatus | null }> {
  const latestByCourseId = new Map<string, CourseSpecStatusRow>();

  for (const spec of specs) {
    const current = latestByCourseId.get(spec.courseId);
    if (!current || isNewerSpec(spec, current)) {
      latestByCourseId.set(spec.courseId, spec);
    }
  }

  return courses.map((course) => ({
    ...course,
    reviewStatus: latestByCourseId.get(course.id)?.reviewStatus ?? null,
  }));
}

export async function attachLatestCourseSpecReviewStatus<T extends CourseRow>(
  courses: readonly T[],
): Promise<Array<T & { reviewStatus: CourseSpecReviewStatus | null }>> {
  if (courses.length === 0) return [];

  const specs = await prisma.courseSpec.findMany({
    where: { courseId: { in: courses.map((course) => course.id) } },
    select: {
      courseId: true,
      versionMajor: true,
      versionMinor: true,
      reviewStatus: true,
    },
  });

  return projectLatestCourseSpecReviewStatus(courses, specs);
}
