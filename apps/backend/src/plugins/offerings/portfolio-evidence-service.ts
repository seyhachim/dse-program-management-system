import type {
  CourseRef,
  CoursesServiceContract,
  LecturerTeachingEvidenceRef,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";

const courses = () => registry.get<CoursesServiceContract>("courses").service;

/**
 * Narrow cross-plugin surface for Lecturer Portfolio/AUN-QA evidence.
 * Offering remains the source of truth; no teaching claim is copied into the
 * portfolio tables.
 */
export const portfolioTeachingEvidenceService = {
  async portfolioTeachingForLecturer(
    lecturerId: string,
  ): Promise<LecturerTeachingEvidenceRef[]> {
    const rows = await prisma.offering.findMany({
      where: {
        OR: [
          { lecturerId },
          { coLecturers: { some: { lecturerId } } },
        ],
      },
      select: {
        id: true,
        courseId: true,
        lecturerId: true,
        term: true,
        sectionCode: true,
        status: true,
      },
      orderBy: [{ term: "desc" }, { sectionCode: "asc" }],
    });

    const courseById = new Map(
      (await Promise.all(
        [...new Set(rows.map((row) => row.courseId))].map((id) => courses().getById(id)),
      ))
        .filter((course): course is CourseRef => course != null)
        .map((course) => [course.id, course]),
    );

    return rows.flatMap((row) => {
      const course = courseById.get(row.courseId);
      if (!course) return [];
      return [{
        offeringId: row.id,
        courseId: row.courseId,
        courseCode: course.code,
        courseTitle: course.title,
        term: row.term,
        sectionCode: row.sectionCode,
        status: row.status,
        role: row.lecturerId === lecturerId ? "Primary Lecturer" as const : "Co-Lecturer" as const,
      }];
    });
  },
};
