import type {
  CurriculumSemester,
  ProgrammeCurriculumRead,
} from "@dse-pms/shared-types";

export type CurriculumPlacement = {
  yearLevel: number;
  semester: CurriculumSemester;
  sortOrder: number;
};

export type CourseWithCurriculumPlacement<T extends { id: string; code: string }> =
  T & {
    curriculumPlacement: CurriculumPlacement | null;
  };

function semesterRank(semester: CurriculumSemester): number {
  return semester === "First" ? 0 : 1;
}

function placementRank(placement: CurriculumPlacement): number {
  return (placement.yearLevel - 1) * 2 + semesterRank(placement.semester);
}

/**
 * Build one authoritative placement per course from the selected curriculum.
 * If malformed/imported data ever places the same course more than once, keep
 * the earliest year/semester/sort position so the catalogue never duplicates a
 * course row.
 */
export function buildCoursePlacementMap(
  years: ProgrammeCurriculumRead["years"],
): Map<string, CurriculumPlacement> {
  const placements = years
    .flatMap((year) =>
      year.semesters.flatMap((semester) =>
        semester.courses.map((course) => ({
          courseId: course.courseId,
          yearLevel: course.yearLevel,
          semester: course.semester,
          sortOrder: course.sortOrder,
        })),
      ),
    )
    .sort((a, b) => {
      const rankDiff = placementRank(a) - placementRank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.sortOrder - b.sortOrder;
    });

  const byCourseId = new Map<string, CurriculumPlacement>();
  for (const placement of placements) {
    if (!byCourseId.has(placement.courseId)) {
      byCourseId.set(placement.courseId, {
        yearLevel: placement.yearLevel,
        semester: placement.semester,
        sortOrder: placement.sortOrder,
      });
    }
  }
  return byCourseId;
}

/** Sort programme-wide courses by curriculum year, semester, placement order, then code. */
export function orderCoursesByCurriculum<T extends { id: string; code: string }>(
  courses: T[],
  placementByCourseId: ReadonlyMap<string, CurriculumPlacement>,
): Array<CourseWithCurriculumPlacement<T>> {
  return courses
    .map((course) => ({
      ...course,
      curriculumPlacement: placementByCourseId.get(course.id) ?? null,
    }))
    .sort((a, b) => {
      const aPlacement = a.curriculumPlacement;
      const bPlacement = b.curriculumPlacement;
      if (aPlacement && !bPlacement) return -1;
      if (!aPlacement && bPlacement) return 1;
      if (aPlacement && bPlacement) {
        const rankDiff = placementRank(aPlacement) - placementRank(bPlacement);
        if (rankDiff !== 0) return rankDiff;
        const sortDiff = aPlacement.sortOrder - bPlacement.sortOrder;
        if (sortDiff !== 0) return sortDiff;
      }
      return a.code.localeCompare(b.code);
    });
}

export function curriculumGroupLabel(
  placement: CurriculumPlacement | null,
): string {
  if (!placement) return "Not in current curriculum";
  const semester = placement.semester === "First" ? 1 : 2;
  return `Year ${placement.yearLevel} · Semester ${semester}`;
}
