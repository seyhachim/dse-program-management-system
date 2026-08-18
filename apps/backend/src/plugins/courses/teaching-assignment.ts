import type { CourseInfoSection } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

type TeachingAssignmentOffering = {
  lecturer: {
    name: string;
    qualification: string | null;
    email: string;
    phone: string | null;
  } | null;
  coLecturers: Array<{
    lecturer: {
      name: string;
    };
  }>;
  otherLecturers: string | null;
  semester: CourseInfoSection["semester"];
  programmeYear: CourseInfoSection["programmeYear"];
};

/**
 * Build the Offering filter used by the Course Specification Overview.
 * Lecturer-scoped requests must match either the primary lecturer assignment or
 * a normalized co-lecturer assignment. Programme-wide callers use the newest
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

/** Convert a normalized Offering teaching team into Course Information fields. */
export function courseInfoFromTeachingAssignment(
  offering: TeachingAssignmentOffering,
): Partial<CourseInfoSection> {
  const primary = offering.lecturer;
  const coLecturerNames = offering.coLecturers
    .map(({ lecturer }) => lecturer.name.trim())
    .filter(Boolean);

  return {
    instructorName: primary?.name ?? "",
    qualification: primary?.qualification ?? "",
    email: primary?.email ?? "",
    telephone: primary?.phone ?? "",
    // Canonical assignments win. Keep the legacy free-text value only when an
    // offering has no normalized co-lecturer assignments yet.
    otherLecturers:
      coLecturerNames.length > 0
        ? coLecturerNames.join(", ")
        : (offering.otherLecturers ?? ""),
    semester: offering.semester,
    programmeYear: offering.programmeYear,
  };
}

/**
 * Course Information is mostly derived data. For lecturer-scoped requests, use
 * the newest Offering of this course that actually contains the logged-in
 * lecturer (either as primary or co-lecturer). Programme-wide callers fall back
 * to the newest Offering for the course.
 *
 * This keeps the Overview aligned with the same Offering-based assignment model
 * used by course access control instead of relying on Course.lecturerId or the
 * legacy free-text `otherLecturers` field.
 */
export async function resolveCourseInfoTeachingAssignment(
  courseId: string,
  currentLecturerId?: string,
): Promise<Partial<CourseInfoSection> | null> {
  let offering = await prisma.offering.findFirst({
    where: buildTeachingAssignmentWhere(courseId, currentLecturerId),
    orderBy: { createdAt: "desc" },
    include: {
      lecturer: true,
      coLecturers: {
        include: { lecturer: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Defensive fallback for old/inconsistent data. A lecturer who passed the
  // course access guard should normally always match the first query.
  if (!offering && currentLecturerId) {
    offering = await prisma.offering.findFirst({
      where: { courseId },
      orderBy: { createdAt: "desc" },
      include: {
        lecturer: true,
        coLecturers: {
          include: { lecturer: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  if (!offering) return null;

  return courseInfoFromTeachingAssignment(offering);
}

/** Overlay Offering-derived lecturer fields onto a Course Spec API envelope. */
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
