import type {
  CourseSpecResponsibleLecturersView,
  CourseSpecTeamSummary,
  LecturerRef,
  LecturersServiceContract,
  ListCoursesQuery,
  SetCourseSpecResponsibleLecturersInput,
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

type CourseSpecTeamSnapshotRow = {
  courseCode: string;
  instructorName: string | null;
  email: string | null;
};

const SHARED_RESPONSIBILITY_COURSE_CODES = new Set(["FPR401", "FPR402"]);

function lecturers(): LecturersServiceContract {
  return registry.get<LecturersServiceContract>("lecturers").service;
}

function isSharedResponsibilityCourse(code: string): boolean {
  return SHARED_RESPONSIBILITY_COURSE_CODES.has(code.toUpperCase());
}

function courseTeamSummary(
  course: { code: string; lecturerId?: string | null },
  team: ResponsibleLecturerRow[],
): CourseSpecTeamSummary {
  const leadIsOnTeam = Boolean(
    course.lecturerId && team.some((lecturer) => lecturer.id === course.lecturerId),
  );
  const responsibilityMode =
    isSharedResponsibilityCourse(course.code) || (team.length > 0 && !leadIsOnTeam)
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

function courseInfoTeamData(
  responsibilityMode: "LEAD_AND_CO" | "SHARED",
  leadLecturer: LecturerRef | null,
  teamLecturers: LecturerRef[],
) {
  const listedLecturers = (
    responsibilityMode === "SHARED"
      ? teamLecturers
      : teamLecturers.filter((lecturer) => lecturer.id !== leadLecturer?.id)
  )
    .map((lecturer) => lecturer.name)
    .sort((a, b) => a.localeCompare(b));

  return {
    ...(leadLecturer
      ? {
          instructorName: leadLecturer.name,
          instructorTitle: leadLecturer.title ?? "",
          qualification: leadLecturer.qualification ?? "",
          email: leadLecturer.email,
          telephone: leadLecturer.phone ?? "",
        }
      : {
          instructorName: "",
          instructorTitle: "",
          qualification: "",
          email: "",
          telephone: "",
        }),
    otherLecturers: listedLecturers.join(", "),
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

async function teamForSpec(courseSpecId: string): Promise<ResponsibleLecturerRow[]> {
  return prisma.$queryRaw<ResponsibleLecturerRow[]>`
    SELECT lecturer."id", lecturer."name", lecturer."email"
    FROM "CourseSpecResponsibleLecturer" responsibility
    INNER JOIN "User" lecturer ON lecturer."id" = responsibility."lecturerId"
    WHERE responsibility."courseSpecId" = ${courseSpecId}
    ORDER BY lecturer."name" ASC
  `;
}

/**
 * Resolve the academic Course Team for one exact CourseSpec version.
 *
 * Course.lecturerId is deliberately not used here: it follows the current editable
 * version and could therefore mislabel a historical Approved version after a later
 * revision changes the lead. Instead, match the exact version's frozen CourseInfo
 * instructor identity against that same version's CourseSpecResponsibleLecturer rows.
 * If the frozen lead cannot be proven, return shared responsibility rather than
 * inventing a historical lead.
 */
export async function courseSpecTeamForVersion(
  courseSpecId: string,
): Promise<CourseSpecTeamSummary | null> {
  const snapshotRows = await prisma.$queryRaw<CourseSpecTeamSnapshotRow[]>`
    SELECT
      course."code" AS "courseCode",
      info."instructorName" AS "instructorName",
      info."email" AS "email"
    FROM "CourseSpec" spec
    INNER JOIN "Course" course ON course."id" = spec."courseId"
    LEFT JOIN "CourseSpecCourseInfo" info ON info."courseSpecId" = spec."id"
    WHERE spec."id" = ${courseSpecId}
    LIMIT 1
  `;
  const snapshot = snapshotRows[0];
  if (!snapshot) return null;

  const team = await teamForSpec(courseSpecId);
  if (isSharedResponsibilityCourse(snapshot.courseCode)) {
    return courseTeamSummary({ code: snapshot.courseCode, lecturerId: null }, team);
  }
  if (team.length === 0) {
    return courseTeamSummary({ code: snapshot.courseCode, lecturerId: null }, team);
  }

  const frozenEmail = snapshot.email?.trim().toLowerCase() ?? "";
  let lead = frozenEmail
    ? team.find((lecturer) => lecturer.email.trim().toLowerCase() === frozenEmail)
    : undefined;

  if (!lead) {
    const frozenName = snapshot.instructorName?.trim() ?? "";
    if (frozenName) {
      const matches = team.filter((lecturer) => lecturer.name.trim() === frozenName);
      if (matches.length === 1) lead = matches[0];
    }
  }

  return courseTeamSummary(
    { code: snapshot.courseCode, lecturerId: lead?.id ?? null },
    team,
  );
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
 * `Course.lecturerId` is the lead for Lead + Co-Lecturer teams; FPR401/FPR402
 * deliberately ignore a lead and always render equal shared responsibility.
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
  const team = spec ? await teamForSpec(spec.id) : [];
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
    isSharedResponsibilityCourse(course.code) &&
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

  const lecturerById = new Map<string, LecturerRef>();
  for (const lecturerId of input.lecturerIds) {
    const lecturer = await lecturers().getById(lecturerId);
    if (!lecturer) {
      throw new Error("Assigned Course Team lecturer does not exist");
    }
    lecturerById.set(lecturerId, lecturer);
  }
  const leadLecturer = leadLecturerId
    ? (lecturerById.get(leadLecturerId) ?? null)
    : null;
  const teamLecturers = [...lecturerById.values()];

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
    await tx.courseSpecCourseInfo.update({
      where: { courseSpecId: spec!.id },
      data: courseInfoTeamData(
        input.responsibilityMode,
        leadLecturer,
        teamLecturers,
      ),
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
