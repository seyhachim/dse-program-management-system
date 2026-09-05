import type { CourseInfoSection } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

type TeachingAssignmentOffering = {
  semester: CourseInfoSection["semester"];
  programmeYear: CourseInfoSection["programmeYear"];
};

/**
 * Build the Offering filter used to resolve delivery context for Course Information.
 * Lecturer-scoped requests match either the primary lecturer assignment or a
 * normalized co-lecturer assignment. Programme-wide callers use the newest
 * Offering for the course regardless of lecturer.
 */
export function buildTeachingAssignmentWhere(
  courseId: string,
  currentLecturerId?: string,
) {
  return currentLecturerId
    ? {
        courseId,
        OR: [
          { lecturerId: currentLecturerId },
          { coLecturers: { some: { lecturerId: currentLecturerId } } },
        ],
      }
    : { courseId };
}

/**
 * Convert an Offering into delivery-only Course Information context.
 *
 * Lecturer identity and Course Team membership belong to the version-scoped
 * CourseSpecCourseInfo snapshot. Never return those fields here, otherwise an
 * Offering with a different delivery team can overwrite the Course Specification
 * Responsible Lecturer / Co-Lecturers when the API response is assembled.
 */
export function courseInfoFromTeachingAssignment(
  offering: TeachingAssignmentOffering,
): Partial<CourseInfoSection> {
  return {
    semester: offering.semester,
    programmeYear: offering.programmeYear,
  };
}

/**
 * Resolve delivery context for the Course Specification Overview.
 *
 * The Course Specification's lecturer/team fields remain authoritative from its
 * own version-scoped snapshot. Offering data contributes only semester/year until
 * those fields move to the authoritative curriculum-placement source.
 */
export async function resolveCourseInfoTeachingAssignment(
  courseId: string,
  currentLecturerId?: string,
): Promise<Partial<CourseInfoSection> | null> {
  let offering = await prisma.offering.findFirst({
    where: buildTeachingAssignmentWhere(courseId, currentLecturerId),
    orderBy: { createdAt: "desc" },
    select: {
      semester: true,
      programmeYear: true,
    },
  });

  // Defensive fallback for Course-Team-only access or old/inconsistent delivery
  // assignments. This fallback may supply delivery context, but never lecturer
  // identity or Course Team membership.
  if (!offering && currentLecturerId) {
    offering = await prisma.offering.findFirst({
      where: { courseId },
      orderBy: { createdAt: "desc" },
      select: {
        semester: true,
        programmeYear: true,
      },
    });
  }

  if (!offering) return null;

  return courseInfoFromTeachingAssignment(offering);
}

/** Overlay Offering-derived delivery context onto a Course Spec API envelope. */
export async function overlayCourseSpecTeachingAssignment(
  spec: { data: Record<string, unknown> },
  courseId: string,
  currentLecturerId?: string,
): Promise<void> {
  const assignment = await resolveCourseInfoTeachingAssignment(
    courseId,
    currentLecturerId,
  );
  if (!assignment) return;

  const courseInfo = (spec.data.courseInfo ?? {}) as Record<string, unknown>;
  spec.data.courseInfo = { ...courseInfo, ...assignment };
}
