import type { CourseSpecProgress, Semester } from "@dse-pms/shared-types";

export interface CourseSpecSemesterGroup {
  semester: Semester;
  courses: CourseSpecProgress[];
  courseCount: number;
  percent: number;
}

export interface CourseSpecYearGroup {
  programmeYear: number;
  semesters: CourseSpecSemesterGroup[];
  courseCount: number;
  percent: number;
}

export interface CourseSpecUnassignedGroup {
  courses: CourseSpecProgress[];
  courseCount: number;
  percent: number;
}

export interface CourseSpecProgressGroups {
  years: CourseSpecYearGroup[];
  unassigned: CourseSpecUnassignedGroup;
}

const SEMESTER_ORDER: Record<Semester, number> = {
  First: 1,
  Second: 2,
};

export function courseSpecRowsPercent(rows: readonly CourseSpecProgress[]): number {
  const completed = rows.reduce((sum, row) => sum + row.completed, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return total ? Math.round((completed / total) * 100) : 0;
}

function sortCourses(rows: CourseSpecProgress[]): CourseSpecProgress[] {
  return [...rows].sort((a, b) => {
    const aOrder = a.curriculumPlacement?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.curriculumPlacement?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder || a.code.localeCompare(b.code);
  });
}

export function buildCourseSpecProgressGroups(
  rows: readonly CourseSpecProgress[],
): CourseSpecProgressGroups {
  const byYear = new Map<number, Map<Semester, CourseSpecProgress[]>>();
  const unassigned: CourseSpecProgress[] = [];

  for (const row of rows) {
    const placement = row.curriculumPlacement;
    if (!placement || !Number.isInteger(placement.programmeYear) || placement.programmeYear < 1) {
      unassigned.push(row);
      continue;
    }

    const semesters = byYear.get(placement.programmeYear) ?? new Map<Semester, CourseSpecProgress[]>();
    const courses = semesters.get(placement.semester) ?? [];
    courses.push(row);
    semesters.set(placement.semester, courses);
    byYear.set(placement.programmeYear, semesters);
  }

  const years = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([programmeYear, semesters]) => {
      const semesterGroups = [...semesters.entries()]
        .sort(([a], [b]) => SEMESTER_ORDER[a] - SEMESTER_ORDER[b])
        .map(([semester, courses]) => {
          const sortedCourses = sortCourses(courses);
          return {
            semester,
            courses: sortedCourses,
            courseCount: sortedCourses.length,
            percent: courseSpecRowsPercent(sortedCourses),
          };
        });
      const allCourses = semesterGroups.flatMap((group) => group.courses);
      return {
        programmeYear,
        semesters: semesterGroups,
        courseCount: allCourses.length,
        percent: courseSpecRowsPercent(allCourses),
      };
    });

  const sortedUnassigned = [...unassigned].sort((a, b) => a.code.localeCompare(b.code));
  return {
    years,
    unassigned: {
      courses: sortedUnassigned,
      courseCount: sortedUnassigned.length,
      percent: courseSpecRowsPercent(sortedUnassigned),
    },
  };
}
