import type {
  CourseSpecProgress,
  OfferingView,
  Semester,
} from "@dse-pms/shared-types";

export const ALL_COURSE_FILTER = "__all__";

export type CourseSpecRowRole = "Responsible" | "Primary" | "Co-Lecturer";

export type CourseSpecCourse = {
  id: string;
  code: string;
  title: string;
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

    // Academic-period filters describe Offerings. A Responsible-Lecturer-only
    // course stays visible under All, but cannot match a concrete Offering filter.
    if (hasOfferingFilter && matchingOfferings.length === 0) continue;

    const displayedOfferings = hasOfferingFilter
      ? matchingOfferings
      : allCourseOfferings;
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
    if (a.programmeYear == null && b.programmeYear != null) return 1;
    if (a.programmeYear != null && b.programmeYear == null) return -1;
    if (a.programmeYear !== b.programmeYear) {
      return (a.programmeYear ?? 99) - (b.programmeYear ?? 99);
    }
    return a.course.code.localeCompare(b.course.code);
  });
}

export function courseSpecRowGroupLabel(row: CourseSpecRow): string {
  if (row.offerings.length === 0) return "Course Spec preparation";
  return row.programmeYear != null
    ? `Year ${row.programmeYear}`
    : "Study year not set";
}
