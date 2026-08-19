import type {
  CourseSpecResponsibleLecturersView,
  LecturersServiceContract,
  ListCoursesQuery,
  SetCourseSpecResponsibleLecturersInput,
} from "@dse-pms/shared-types";
import type { CourseSpecReviewStatus } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import {
  buildCourseInfoSnapshot,
  courseInfoSnapshotData,
} from "./course-info-snapshot.ts";
import { assertCourseSpecEditable } from "./spec-lock.ts";

type CurrentSpecRow = {
  id: string;
  courseId: string;
  versionMajor: number;
  versionMinor: number;
  reviewStatus: CourseSpecReviewStatus;
};

type ResponsibleLecturerRow = {
  id: string;
  name: string;
  email: string;
};

type ResponsibleCourseRow = {
  courseId: string;
};

function lecturers(): LecturersServiceContract {
  return registry.get<LecturersServiceContract>("lecturers").service;
}

async function currentSpec(courseId: string): Promise<CurrentSpecRow | null> {
  const rows = await prisma.$queryRaw<CurrentSpecRow[]>`
    SELECT "id", "courseId", "versionMajor", "versionMinor", "reviewStatus"::text
    FROM "CourseSpec"
    WHERE "courseId" = ${courseId}
    ORDER BY "versionMajor" DESC, "versionMinor" DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function courseIdsForResponsibleLecturer(
  lecturerId: string,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<ResponsibleCourseRow[]>`
    SELECT current_spec."courseId"
    FROM (
      SELECT DISTINCT ON ("courseId") "id", "courseId"
      FROM "CourseSpec"
      ORDER BY "courseId", "versionMajor" DESC, "versionMinor" DESC
    ) current_spec
    INNER JOIN "CourseSpecResponsibleLecturer" responsibility
      ON responsibility."courseSpecId" = current_spec."id"
    WHERE responsibility."lecturerId" = ${lecturerId}
  `;
  return rows.map((row) => row.courseId);
}

export async function responsibleLecturerCanAccess(
  courseId: string,
  lecturerId: string,
): Promise<boolean> {
  return (await courseIdsForResponsibleLecturer(lecturerId)).includes(courseId);
}

export async function getCourseSpecResponsibleLecturers(
  courseId: string,
): Promise<CourseSpecResponsibleLecturersView | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true },
  });
  if (!course) return null;

  const spec = await currentSpec(courseId);
  const team = spec
    ? await prisma.$queryRaw<ResponsibleLecturerRow[]>`
        SELECT lecturer."id", lecturer."name", lecturer."email"
        FROM "CourseSpecResponsibleLecturer" responsibility
        INNER JOIN "User" lecturer ON lecturer."id" = responsibility."lecturerId"
        WHERE responsibility."courseSpecId" = ${spec.id}
        ORDER BY lecturer."name" ASC
      `
    : [];

  return {
    courseId,
    courseSpecId: spec?.id ?? null,
    academicVersion: spec ? `${spec.versionMajor}.${spec.versionMinor}` : "1.0",
    reviewStatus: spec?.reviewStatus ?? "Draft",
    lecturers: team,
  };
}

export async function setCourseSpecResponsibleLecturers(
  courseId: string,
  input: SetCourseSpecResponsibleLecturersInput,
): Promise<CourseSpecResponsibleLecturersView> {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new Error("Course not found");

  for (const lecturerId of input.lecturerIds) {
    if (!(await lecturers().getById(lecturerId))) {
      throw new Error("Assigned responsible lecturer does not exist");
    }
  }

  let spec = await currentSpec(courseId);
  if (!spec) {
    const snapshot = await buildCourseInfoSnapshot(course);
    const created = await prisma.courseSpec.create({
      data: {
        courseId,
        courseInfo: { create: courseInfoSnapshotData(snapshot) },
      },
      select: {
        id: true,
        courseId: true,
        versionMajor: true,
        versionMinor: true,
        reviewStatus: true,
      },
    });
    spec = created;
  } else {
    assertCourseSpecEditable(spec.reviewStatus);
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "CourseSpecResponsibleLecturer"
      WHERE "courseSpecId" = ${spec!.id}
    `;
    for (const lecturerId of input.lecturerIds) {
      await tx.$executeRaw`
        INSERT INTO "CourseSpecResponsibleLecturer" ("courseSpecId", "lecturerId")
        VALUES (${spec!.id}, ${lecturerId})
      `;
    }
  });

  return (await getCourseSpecResponsibleLecturers(courseId))!;
}

/**
 * Merge Course rows from the existing Offering-based scope with courses whose
 * current Course Spec assigns the lecturer. `getDetailed` is supplied by the
 * Courses service so this module remains inside the plugin boundary.
 */
export async function mergeResponsibleCourses<T extends { id: string; code: string; title: string }>(
  baseRows: T[],
  lecturerId: string,
  query: ListCoursesQuery,
  getDetailed: (courseId: string) => Promise<T | null>,
): Promise<T[]> {
  const existing = new Set(baseRows.map((row) => row.id));
  const responsibilityIds = await courseIdsForResponsibleLecturer(lecturerId);
  const extra: T[] = [];

  for (const courseId of responsibilityIds) {
    if (existing.has(courseId)) continue;
    const row = await getDetailed(courseId);
    if (!row) continue;
    const needle = query.search?.trim().toLowerCase();
    if (
      needle &&
      !row.code.toLowerCase().includes(needle) &&
      !row.title.toLowerCase().includes(needle)
    ) {
      continue;
    }
    extra.push(row);
  }

  return [...baseRows, ...extra].sort((a, b) => a.code.localeCompare(b.code));
}
