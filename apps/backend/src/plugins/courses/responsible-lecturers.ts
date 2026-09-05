import {
  isFinalProjectCourseCode,
  type CourseSpecResponsibleLecturersView,
  type CourseSpecTeamSummary,
  type LecturersServiceContract,
  type ListCoursesQuery,
  type SetCourseSpecResponsibleLecturersInput,
} from "@dse-pms/shared-types";
import { Prisma, type CourseSpecReviewStatus } from "@prisma/client";
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

type ResponsibleLecturerCourseRow = ResponsibleLecturerRow & {
  courseId: string;
};

type ResponsibleCourseRow = {
  courseId: string;
};

function lecturers(): LecturersServiceContract {
  return registry.get<LecturersServiceContract>("lecturers").service;
}

function courseTeamSummary(
  course: { code: string; lecturerId?: string | null },
  team: ResponsibleLecturerRow[],
): CourseSpecTeamSummary {
  const leadIsOnTeam = Boolean(
    course.lecturerId && team.some((lecturer) => lecturer.id === course.lecturerId),
  );
  const responsibilityMode =
    isFinalProjectCourseCode(course.code) || (team.length > 0 && !leadIsOnTeam)
      ? ("SHARED" as const)
      : ("LEAD_AND_CO" as const);
  const leadLecturerId =
    responsibilityMode === "LEAD_AND_CO" && leadIsOnTeam
      ? (course.lecturerId ?? null)
      : null;

  return {
    responsibilityMode,
    leadLecturerId,
    lecturers: team.map((lecturer) => ({
      ...lecturer,
      role:
        responsibilityMode === "SHARED"
          ? ("SHARED" as const)
          : lecturer.id === leadLecturerId
            ? ("RESPONSIBLE" as const)
            : ("CO_LECTURER" as const),
    })),
  };
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

/**
 * Attach the current Course Specification team to a course list in one query.
 * `Course.lecturerId` is the lead for Lead + Co-Lecturer teams; Final Project
 * courses deliberately ignore a lead and always render equal shared responsibility.
 */
export async function attachCourseSpecTeams<
  T extends { id: string; code: string; lecturerId?: string | null },
>(rows: T[]): Promise<Array<T & { courseTeam: CourseSpecTeamSummary }>> {
  if (rows.length === 0) return [];

  const courseIds = rows.map((row) => row.id);
  const assignments = await prisma.$queryRaw<ResponsibleLecturerCourseRow[]>(
    Prisma.sql`
      SELECT current_spec."courseId", lecturer."id", lecturer."name", lecturer."email"
      FROM (
        SELECT DISTINCT ON ("courseId") "id", "courseId"
        FROM "CourseSpec"
        WHERE "courseId" IN (${Prisma.join(courseIds)})
        ORDER BY "courseId", "versionMajor" DESC, "versionMinor" DESC
      ) current_spec
      INNER JOIN "CourseSpecResponsibleLecturer" responsibility
        ON responsibility."courseSpecId" = current_spec."id"
      INNER JOIN "User" lecturer ON lecturer."id" = responsibility."lecturerId"
      ORDER BY current_spec."courseId", lecturer."name" ASC
    `,
  );
  const byCourse = new Map<string, ResponsibleLecturerRow[]>();
  for (const assignment of assignments) {
    const team = byCourse.get(assignment.courseId) ?? [];
    team.push({ id: assignment.id, name: assignment.name, email: assignment.email });
    byCourse.set(assignment.courseId, team);
  }

  return rows.map((row) => ({
    ...row,
    courseTeam: courseTeamSummary(row, byCourse.get(row.id) ?? []),
  }));
}

export async function getCourseSpecResponsibleLecturers(
  courseId: string,
): Promise<CourseSpecResponsibleLecturersView | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, code: true, lecturerId: true },
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
  const summary = courseTeamSummary(course, team);

  return {
    courseId,
    courseCode: course.code,
    courseSpecId: spec?.id ?? null,
    academicVersion: spec ? `${spec.versionMajor}.${spec.versionMinor}` : "1.0",
    reviewStatus: spec?.reviewStatus ?? "Draft",
    ...summary,
  };
}

export async function setCourseSpecResponsibleLecturers(
  courseId: string,
  input: SetCourseSpecResponsibleLecturersInput,
): Promise<CourseSpecResponsibleLecturersView> {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new Error("Course not found");

  if (
    isFinalProjectCourseCode(course.code) &&
    input.responsibilityMode !== "SHARED"
  ) {
    throw new Error(`${course.code} uses shared responsibility for all Course Team members`);
  }

  const leadLecturerId =
    input.responsibilityMode === "LEAD_AND_CO" ? (input.leadLecturerId ?? null) : null;
  if (
    input.responsibilityMode === "LEAD_AND_CO" &&
    input.lecturerIds.length > 0 &&
    (!leadLecturerId || !input.lecturerIds.includes(leadLecturerId))
  ) {
    throw new Error("Choose one Responsible Lecturer from the Course Team");
  }

  for (const lecturerId of input.lecturerIds) {
    if (!(await lecturers().getById(lecturerId))) {
      throw new Error("Assigned Course Team lecturer does not exist");
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
    await tx.course.update({
      where: { id: courseId },
      data: { lecturerId: leadLecturerId },
    });
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
