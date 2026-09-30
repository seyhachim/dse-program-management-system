import type {
  CurriculumCompetencyMap,
  CurriculumCompetencyMapCourse,
  CurriculumCompetencyLevel,
  CurriculumCourseCompetencyMapping,
  CourseType,
} from "@dse-pms/shared-types";

export type CompetencyMapFilters = {
  year: "all" | 1 | 2 | 3 | 4;
  semester: "all" | "First" | "Second";
  pathwayId: "all" | "unassigned" | string;
  courseType: "all" | CourseType;
  competencyId: "all" | string;
  search: string;
};

export const DEFAULT_COMPETENCY_MAP_FILTERS: CompetencyMapFilters = {
  year: "all",
  semester: "all",
  pathwayId: "all",
  courseType: "all",
  competencyId: "all",
  search: "",
};

export function filterCompetencyMapCourses(
  courses: CurriculumCompetencyMapCourse[],
  filters: CompetencyMapFilters,
): CurriculumCompetencyMapCourse[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return courses.filter((course) => {
    if (filters.year !== "all" && course.yearLevel !== filters.year) return false;
    if (
      filters.semester !== "all" &&
      course.semester !== filters.semester
    ) {
      return false;
    }
    if (
      filters.pathwayId !== "all" &&
      (filters.pathwayId === "unassigned"
        ? course.pathwayId !== null
        : course.pathwayId !== filters.pathwayId)
    ) {
      return false;
    }
    if (
      filters.courseType !== "all" &&
      course.courseType !== filters.courseType
    ) {
      return false;
    }
    if (
      query &&
      !course.code.toLocaleLowerCase().includes(query) &&
      !course.title.toLocaleLowerCase().includes(query)
    ) {
      return false;
    }
    return true;
  });
}

export function visibleCompetencies(
  map: CurriculumCompetencyMap,
  competencyId: CompetencyMapFilters["competencyId"],
) {
  const competencies = map.framework?.competencies ?? [];
  return competencyId === "all"
    ? competencies
    : competencies.filter((competency) => competency.id === competencyId);
}

export function findCompetencyMapping(
  course: CurriculumCompetencyMapCourse,
  competencyId: string,
): CurriculumCourseCompetencyMapping | null {
  return (
    course.mappings.find((mapping) => mapping.competencyId === competencyId) ??
    null
  );
}

export function levelShort(level: CurriculumCompetencyLevel | null): string {
  if (!level) return "—";
  return level === "Basic" ? "B" : level === "Intermediate" ? "I" : "A";
}

export function compactMappingLabel(
  mapping: CurriculumCourseCompetencyMapping | null,
): string {
  if (!mapping) return "No mapping recorded";
  const parts = [
    mapping.teachLevel ? `T:${levelShort(mapping.teachLevel)}` : null,
    mapping.useLevel ? `U:${levelShort(mapping.useLevel)}` : null,
    mapping.assessLevel ? `A:${levelShort(mapping.assessLevel)}` : null,
  ].filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(" ") : "No mapping recorded";
}

export type CompetencyPathwayCourse = {
  course: CurriculumCompetencyMapCourse;
  mapping: CurriculumCourseCompetencyMapping;
  pathwayName: string | null;
};

export type CompetencyPathwayYear = {
  yearLevel: number;
  semesters: Array<{
    semester: "First" | "Second";
    courses: CompetencyPathwayCourse[];
  }>;
};

export function buildCompetencyPathway(
  map: CurriculumCompetencyMap,
  competencyId: string,
  courses: CurriculumCompetencyMapCourse[] = map.courses,
): CompetencyPathwayYear[] {
  const pathwayNameById = new Map(
    map.pathways.map((pathway) => [pathway.id, pathway.name]),
  );
  const grouped = new Map<
    number,
    Map<"First" | "Second", CompetencyPathwayCourse[]>
  >();

  for (const course of courses) {
    const mapping = findCompetencyMapping(course, competencyId);
    if (!mapping) continue;
    const semesters =
      grouped.get(course.yearLevel) ??
      new Map<"First" | "Second", CompetencyPathwayCourse[]>();
    const semesterCourses = semesters.get(course.semester) ?? [];
    semesterCourses.push({
      course,
      mapping,
      pathwayName: course.pathwayId
        ? pathwayNameById.get(course.pathwayId) ?? null
        : null,
    });
    semesters.set(course.semester, semesterCourses);
    grouped.set(course.yearLevel, semesters);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([yearLevel, semesters]) => ({
      yearLevel,
      semesters: (["First", "Second"] as const)
        .filter((semester) => (semesters.get(semester)?.length ?? 0) > 0)
        .map((semester) => ({
          semester,
          courses: (semesters.get(semester) ?? []).slice().sort((a, b) => {
            if (a.course.sortOrder !== b.course.sortOrder) {
              return a.course.sortOrder - b.course.sortOrder;
            }
            return a.course.code.localeCompare(b.course.code);
          }),
        })),
    }));
}
