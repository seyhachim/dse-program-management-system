import type {
  CourseSpecProgress,
  CourseSpecTeamSummary,
  OfferingView,
  Semester,
} from "@dse-pms/shared-types";
import {
  curriculumGroupLabel,
  type CurriculumPlacement,
} from "./course-curriculum-groups";

export const ALL_COURSE_FILTER = "__all__";

export type CourseSpecRowRole = "Responsible" | "Primary" | "Co-Lecturer";

export type CourseSpecCourse = {
  id: string;
  code: string;
  title: string;
  courseTeam?: CourseSpecTeamSummary;
};

export interface CourseSpecRow {
  course: CourseSpecCourse;
  offerings: OfferingView[];
  role: CourseSpecRowRole;
  progress: CourseSpecProgress;
  programmeYear: number | null;
}

export interface CourseSpecRowFilters {
  search: string;
  term: string;
  semester: Semester | typeof ALL_COURSE_FILTER;
  studyYear: string;
}

function emptyProgress(course: CourseSpecCourse): CourseSpecProgress {
  return {
    courseId: course.id,
    code: course.code,
    title: course.title,
    completed: 0,
    total: 0,
    incompleteSections: [],
  };
}

function curriculumPlacementForRow(row: CourseSpecRow): CurriculumPlacement | null {
  const placement = row.progress.curriculumPlacement;
  if (!placement) return null;

  return {
    yearLevel: placement.programmeYear,
    semester: placement.semester,
    sortOrder: placement.sortOrder,
  };
}

function semesterRank(semester: CurriculumPlacement["semester"]): number {
  return semester === "First" ? 0 : 1;
}

export function buildCourseSpecRows({
  courses,
  offerings,
  specProgress,
  lecturerId,
  filters,
}: {
  courses: CourseSpecCourse[];
  offerings: OfferingView[];
  specProgress: CourseSpecProgress[];
  lecturerId: string | null;
  filters: CourseSpecRowFilters;
}): CourseSpecRow[] {
  if (!lecturerId) return [];

  const offeringsByCourse = new Map<string, OfferingView[]>();
  for (const offering of offerings) {
    if (!offering.course) continue;
    const rows = offeringsByCourse.get(offering.course.id) ?? [];
    rows.push(offering);
    offeringsByCourse.set(offering.course.id, rows);
  }

  const progressByCourse = new Map(
    specProgress.map((progress) => [progress.courseId, progress]),
  );
  const searchQuery = filters.search.trim().toLowerCase();
  const hasOfferingFilter =
    filters.term !== ALL_COURSE_FILTER ||
    filters.semester !== ALL_COURSE_FILTER ||
    filters.studyYear !== ALL_COURSE_FILTER;

  const rows: CourseSpecRow[] = [];

  for (const course of courses) {
    if (
      searchQuery &&
      !`${course.code} ${course.title}`.toLowerCase().includes(searchQuery)
    ) {
      continue;
    }

    const allCourseOfferings = offeringsByCourse.get(course.id) ?? [];
    const matchingOfferings = allCourseOfferings.filter((offering) => {
      if (filters.term !== ALL_COURSE_FILTER && offering.term !== filters.term) {
        return false;
      }
      if (
        filters.semester !== ALL_COURSE_FILTER &&
        offering.semester !== filters.semester
      ) {
        return false;
      }
      if (
        filters.studyYear !== ALL_COURSE_FILTER &&
        String(offering.programmeYear ?? "") !== filters.studyYear
      ) {
        return false;
      }
      return true;
    });

    // Academic-period filters describe Offerings. A Course-Team-only course stays
    // visible under All, but cannot match a concrete Offering filter.
    if (hasOfferingFilter && matchingOfferings.length === 0) continue;

    const displayedOfferings = hasOfferingFilter
      ? matchingOfferings
      : allCourseOfferings;
    // Keep the historical Offering role for internal grouping/tests. The UI now
    // shows the objective Course Team instead of a viewer-relative "My Role".
    const isPrimary = displayedOfferings.some(
      (offering) => offering.lecturer?.id === lecturerId,
    );
    const role: CourseSpecRowRole =
      displayedOfferings.length === 0
        ? "Responsible"
        : isPrimary
          ? "Primary"
          : "Co-Lecturer";
    const programmeYear =
      displayedOfferings.find((offering) => offering.programmeYear != null)
        ?.programmeYear ?? null;

    rows.push({
      course,
      offerings: displayedOfferings,
      role,
      progress: progressByCourse.get(course.id) ?? emptyProgress(course),
      programmeYear,
    });
  }

  return rows.sort((a, b) => {
    const aPlacement = curriculumPlacementForRow(a);
    const bPlacement = curriculumPlacementForRow(b);

    if (aPlacement && !bPlacement) return -1;
    if (!aPlacement && bPlacement) return 1;
    if (aPlacement && bPlacement) {
      if (aPlacement.yearLevel !== bPlacement.yearLevel) {
        return aPlacement.yearLevel - bPlacement.yearLevel;
      }
      const semesterDiff =
        semesterRank(aPlacement.semester) - semesterRank(bPlacement.semester);
      if (semesterDiff !== 0) return semesterDiff;
      const sortOrderDiff = aPlacement.sortOrder - bPlacement.sortOrder;
      if (sortOrderDiff !== 0) return sortOrderDiff;
    }
    return a.course.code.localeCompare(b.course.code);
  });
}

export function courseSpecRowGroupLabel(row: CourseSpecRow): string {
  return curriculumGroupLabel(curriculumPlacementForRow(row));
}
