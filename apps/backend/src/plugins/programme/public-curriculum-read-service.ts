import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";

export class PublicCurriculumNotFoundError extends Error {}
export class PublicCurriculumConflictError extends Error {}

export type PublicCurriculumProvenance = {
  curriculumVersionId: string;
  curriculumVersion: string;
  status: "Active" | "Approved";
  sourceFileName: string | null;
  sourceSha256: string | null;
};

export type PublicCurriculumCourse = {
  code: string;
  title: string;
  yearLevel: number;
  semester: "First" | "Second";
  credits: number;
  courseType: string;
  weeklyHoursTotal: number | null;
  weeklyLectureHours: number | null;
  weeklyLabHours: number | null;
  weeklyFieldVisitHours: number | null;
  lecturerText: string;
  pathwayCode: string | null;
  conflicts: string[];
  provenance: PublicCurriculumProvenance;
};

export type PublicCurriculumStudyPlan = {
  yearLevel: number;
  semester: "First" | "Second";
  courses: PublicCurriculumCourse[];
  totalCredits: number;
  totalWeeklyHours: number | null;
  provenance: PublicCurriculumProvenance;
};

export type PublicCurriculumTotals = {
  totalCourses: number;
  totalCredits: number;
  totalWeeklyHours: number | null;
  byYearSemester: Array<{
    yearLevel: number;
    semester: "First" | "Second";
    courseCount: number;
    credits: number;
    weeklyHours: number | null;
  }>;
  provenance: PublicCurriculumProvenance;
};

type VersionRow = {
  id: string;
  versionMajor: number;
  versionMinor: number;
  status: "Active" | "Approved";
  sourceFileName: string | null;
  sourceSha256: string | null;
};

type SnapshotRow = {
  code: string;
  title: string;
  yearLevel: number;
  semester: "First" | "Second";
  credits: number;
  placementCredits: number | null;
  courseType: string | null;
  weeklyHoursTotal: number | null;
  weeklyLectureHours: number | null;
  weeklyLabHours: number | null;
  weeklyFieldVisitHours: number | null;
  lecturerText: string;
  scopeCode: string;
};

async function publishedVersion(programmeId: string): Promise<VersionRow> {
  const rows = await prisma.$queryRaw<VersionRow[]>(Prisma.sql`
    SELECT
      v."id",
      v."versionMajor",
      v."versionMinor",
      v."status"::text AS "status",
      src."fileName" AS "sourceFileName",
      src."sha256" AS "sourceSha256"
    FROM public."ProgrammeCurriculumVersion" v
    JOIN public."ProgrammeCurriculum" c ON c."id" = v."curriculumId"
    JOIN public."Programme" p ON p."id" = c."programmeId"
    LEFT JOIN curriculum_artifact."ImportSource" src ON src."curriculumVersionId" = v."id"
    WHERE c."programmeId" = ${programmeId}
      AND p."status" = 'active'
      AND v."status" IN ('Active'::"ProgrammeCurriculumStatus", 'Approved'::"ProgrammeCurriculumStatus")
    ORDER BY
      CASE WHEN v."status" = 'Active'::"ProgrammeCurriculumStatus" THEN 0 ELSE 1 END,
      v."versionMajor" DESC,
      v."versionMinor" DESC,
      v."id" ASC
  `);

  if (!rows.length) throw new PublicCurriculumNotFoundError("No published curriculum is available");
  const best = rows[0]!;
  const bestRank = best.status;
  const sameRank = rows.filter((row) => row.status === bestRank);
  if (sameRank.length > 1) {
    throw new PublicCurriculumConflictError(
      `Multiple ${bestRank.toLowerCase()} curriculum versions are available; public curriculum cannot be selected safely`,
    );
  }
  return best;
}

function provenance(version: VersionRow): PublicCurriculumProvenance {
  return {
    curriculumVersionId: version.id,
    curriculumVersion: `${version.versionMajor}.${version.versionMinor}`,
    status: version.status,
    sourceFileName: version.sourceFileName,
    sourceSha256: version.sourceSha256,
  };
}

async function snapshots(version: VersionRow): Promise<PublicCurriculumCourse[]> {
  const rows = await prisma.$queryRaw<SnapshotRow[]>(Prisma.sql`
    SELECT
      s."courseCodeSnapshot" AS "code",
      s."courseTitleSnapshot" AS "title",
      s."yearLevel",
      s."semester"::text AS "semester",
      s."creditsTotal" AS "credits",
      pc."creditsSnapshot" AS "placementCredits",
      pc."courseTypeSnapshot"::text AS "courseType",
      s."weeklyHoursTotal",
      s."weeklyLectureHours",
      s."weeklyLabHours",
      s."weeklyFieldVisitHours",
      s."lecturerText",
      s."scopeCode"
    FROM curriculum_artifact."CourseSnapshot" s
    LEFT JOIN public."ProgrammeCurriculumCourse" pc ON pc."id" = s."placementId"
    WHERE s."curriculumVersionId" = ${version.id}
      AND (
        s."scopeCode" = '__COMMON__'
        OR s."scopeCode" IN (
          SELECT p."code"
          FROM public."ProgrammeCurriculumPathway" p
          WHERE p."curriculumVersionId" = ${version.id} AND p."isDefault" = TRUE
        )
      )
    ORDER BY s."yearLevel", s."semester", s."sortOrder", s."courseCodeSnapshot"
  `);

  const source = provenance(version);
  return rows.map((row) => {
    const conflicts: string[] = [];
    if (row.placementCredits !== null && row.placementCredits !== row.credits) {
      conflicts.push(
        `Published curriculum artifact credits (${row.credits}) differ from placement snapshot (${row.placementCredits}); artifact value shown`,
      );
    }
    if (row.weeklyHoursTotal !== null) {
      const componentTotal =
        (row.weeklyLectureHours ?? 0) +
        (row.weeklyLabHours ?? 0) +
        (row.weeklyFieldVisitHours ?? 0);
      if (componentTotal !== row.weeklyHoursTotal) {
        conflicts.push(
          `Weekly hour total (${row.weeklyHoursTotal}) differs from lecture/lab/field components (${componentTotal}); published total shown`,
        );
      }
    }
    return {
      code: row.code,
      title: row.title,
      yearLevel: row.yearLevel,
      semester: row.semester,
      credits: row.credits,
      courseType: row.courseType ?? "Unspecified",
      weeklyHoursTotal: row.weeklyHoursTotal,
      weeklyLectureHours: row.weeklyLectureHours,
      weeklyLabHours: row.weeklyLabHours,
      weeklyFieldVisitHours: row.weeklyFieldVisitHours,
      lecturerText: row.lecturerText,
      pathwayCode: row.scopeCode === "__COMMON__" ? null : row.scopeCode,
      conflicts,
      provenance: source,
    };
  });
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export const publicCurriculumReadService = {
  async listCourses(programmeId: string): Promise<PublicCurriculumCourse[]> {
    const version = await publishedVersion(programmeId);
    return snapshots(version);
  },

  async getCourse(programmeId: string, query: string): Promise<PublicCurriculumCourse> {
    const needle = normalized(query);
    if (!needle) throw new PublicCurriculumNotFoundError("Course query is required");
    const courses = await this.listCourses(programmeId);
    const exact = courses.filter(
      (course) => normalized(course.code) === needle || normalized(course.title) === needle,
    );
    if (exact.length === 1) return exact[0]!;
    if (exact.length > 1) throw new PublicCurriculumConflictError("Course lookup is ambiguous");

    const partial = courses.filter(
      (course) => normalized(course.code).includes(needle) || normalized(course.title).includes(needle),
    );
    if (partial.length === 1) return partial[0]!;
    if (partial.length > 1) throw new PublicCurriculumConflictError("Course lookup matches multiple published courses");
    throw new PublicCurriculumNotFoundError("Course not found in the published curriculum");
  },

  async getStudyPlan(
    programmeId: string,
    yearLevel: number,
    semester: "First" | "Second",
  ): Promise<PublicCurriculumStudyPlan> {
    if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 4) {
      throw new PublicCurriculumNotFoundError("Year level must be between 1 and 4");
    }
    const courses = (await this.listCourses(programmeId)).filter(
      (course) => course.yearLevel === yearLevel && course.semester === semester,
    );
    if (!courses.length) throw new PublicCurriculumNotFoundError("No published courses found for this year and semester");
    const allHoursKnown = courses.every((course) => course.weeklyHoursTotal !== null);
    return {
      yearLevel,
      semester,
      courses,
      totalCredits: courses.reduce((sum, course) => sum + course.credits, 0),
      totalWeeklyHours: allHoursKnown
        ? courses.reduce((sum, course) => sum + (course.weeklyHoursTotal ?? 0), 0)
        : null,
      provenance: courses[0]!.provenance,
    };
  },

  async getTotals(programmeId: string): Promise<PublicCurriculumTotals> {
    const courses = await this.listCourses(programmeId);
    if (!courses.length) throw new PublicCurriculumNotFoundError("Published curriculum contains no courses");
    const byYearSemester: PublicCurriculumTotals["byYearSemester"] = [];
    for (const yearLevel of [1, 2, 3, 4]) {
      for (const semester of ["First", "Second"] as const) {
        const items = courses.filter(
          (course) => course.yearLevel === yearLevel && course.semester === semester,
        );
        if (!items.length) continue;
        byYearSemester.push({
          yearLevel,
          semester,
          courseCount: items.length,
          credits: items.reduce((sum, course) => sum + course.credits, 0),
          weeklyHours: items.every((course) => course.weeklyHoursTotal !== null)
            ? items.reduce((sum, course) => sum + (course.weeklyHoursTotal ?? 0), 0)
            : null,
        });
      }
    }
    return {
      totalCourses: courses.length,
      totalCredits: courses.reduce((sum, course) => sum + course.credits, 0),
      totalWeeklyHours: courses.every((course) => course.weeklyHoursTotal !== null)
        ? courses.reduce((sum, course) => sum + (course.weeklyHoursTotal ?? 0), 0)
        : null,
      byYearSemester,
      provenance: courses[0]!.provenance,
    };
  },
};

export type PublicCurriculumReadService = typeof publicCurriculumReadService;
