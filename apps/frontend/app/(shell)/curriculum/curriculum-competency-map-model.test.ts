import { describe, expect, test } from "bun:test";
import type { CurriculumCompetencyMap } from "@dse-pms/shared-types";
import {
  DEFAULT_COMPETENCY_MAP_FILTERS,
  buildCompetencyPathway,
  compactMappingLabel,
  filterCompetencyMapCourses,
  levelShort,
  visibleCompetencies,
} from "./curriculum-competency-map-model.ts";

function fixture(): CurriculumCompetencyMap {
  const actorId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const frameworkId = crypto.randomUUID();
  const frameworkVersionId = crypto.randomUUID();
  const c1 = crypto.randomUUID();
  const c2 = crypto.randomUUID();
  const p1 = crypto.randomUUID();
  const p2 = crypto.randomUUID();

  return {
    curriculumVersion: { id: versionId, status: "Draft", version: "1.0" },
    framework: {
      frameworkId,
      programmeId: "dse",
      frameworkCode: "dse-graduate-competencies",
      frameworkVersionId,
      version: 1,
      name: "DSE Graduate Competencies",
      changeNote: "",
      createdById: actorId,
      createdAt: "2026-09-29T00:00:00.000Z",
      assignedById: actorId,
      assignedAt: "2026-09-29T00:00:00.000Z",
      competencies: [
        {
          id: c1,
          code: "C1",
          name: "Python Programming for Data Science",
          description: null,
          order: 1,
          sourceActive: true,
          ploCodes: [],
        },
        {
          id: c2,
          code: "C13",
          name: "Critical Thinking and Problem Solving",
          description: null,
          order: 13,
          sourceActive: true,
          ploCodes: [],
        },
      ],
    },
    pathways: [
      {
        id: p1,
        code: "SKILL",
        name: "Skill-oriented",
        yearLevel: 4,
        semester: "Second",
        isDefault: true,
      },
      {
        id: p2,
        code: "RESEARCH",
        name: "Research-oriented",
        yearLevel: 4,
        semester: "Second",
        isDefault: false,
      },
    ],
    courses: [
      {
        placementId: crypto.randomUUID(),
        courseId: crypto.randomUUID(),
        code: "BPR101",
        title: "Basic Programming",
        yearLevel: 1,
        semester: "First",
        credits: 3,
        courseType: "Basic",
        sortOrder: 0,
        pathwayId: null,
        mappings: [
          {
            id: crypto.randomUUID(),
            curriculumVersionId: versionId,
            placementId: crypto.randomUUID(),
            competencyId: c1,
            teachLevel: "Basic",
            useLevel: null,
            assessLevel: null,
            note: "",
            updatedById: actorId,
            createdAt: "2026-09-29T00:00:00.000Z",
            updatedAt: "2026-09-29T00:00:00.000Z",
          },
        ],
      },
      {
        placementId: crypto.randomUUID(),
        courseId: crypto.randomUUID(),
        code: "TSA301",
        title: "Time Series Analysis",
        yearLevel: 3,
        semester: "First",
        credits: 3,
        courseType: "Core",
        sortOrder: 0,
        pathwayId: null,
        mappings: [
          {
            id: crypto.randomUUID(),
            curriculumVersionId: versionId,
            placementId: crypto.randomUUID(),
            competencyId: c2,
            teachLevel: "Intermediate",
            useLevel: "Advanced",
            assessLevel: "Advanced",
            note: "",
            updatedById: actorId,
            createdAt: "2026-09-29T00:00:00.000Z",
            updatedAt: "2026-09-29T00:00:00.000Z",
          },
        ],
      },
      {
        placementId: crypto.randomUUID(),
        courseId: crypto.randomUUID(),
        code: "FPR402",
        title: "Final Project II",
        yearLevel: 4,
        semester: "Second",
        credits: 3,
        courseType: "Core",
        sortOrder: 0,
        pathwayId: p1,
        mappings: [
          {
            id: crypto.randomUUID(),
            curriculumVersionId: versionId,
            placementId: crypto.randomUUID(),
            competencyId: c2,
            teachLevel: null,
            useLevel: "Advanced",
            assessLevel: "Advanced",
            note: "",
            updatedById: actorId,
            createdAt: "2026-09-29T00:00:00.000Z",
            updatedAt: "2026-09-29T00:00:00.000Z",
          },
        ],
      },
    ],
    summary: {
      courseCount: 3,
      competencyCount: 2,
      mappedCourseCount: 3,
      unmappedCourseCount: 0,
      mappedCompetencyCount: 2,
      unmappedCompetencyCount: 0,
    },
  };
}

describe("curriculum competency map projections", () => {
  test("filters by year, semester, pathway, course type, and search", () => {
    const map = fixture();

    expect(
      filterCompetencyMapCourses(map.courses, {
        ...DEFAULT_COMPETENCY_MAP_FILTERS,
        year: 3,
      }).map((course) => course.code),
    ).toEqual(["TSA301"]);

    expect(
      filterCompetencyMapCourses(map.courses, {
        ...DEFAULT_COMPETENCY_MAP_FILTERS,
        pathwayId: map.pathways[0]!.id,
      }).map((course) => course.code),
    ).toEqual(["FPR402"]);

    expect(
      filterCompetencyMapCourses(map.courses, {
        ...DEFAULT_COMPETENCY_MAP_FILTERS,
        courseType: "Basic",
        search: "program",
      }).map((course) => course.code),
    ).toEqual(["BPR101"]);
  });

  test("narrows competency columns without changing course filters", () => {
    const map = fixture();
    const competencyId = map.framework!.competencies[1]!.id;
    expect(visibleCompetencies(map, competencyId).map((item) => item.code)).toEqual([
      "C13",
    ]);
  });

  test("builds a deterministic year/semester pathway from the same mappings", () => {
    const map = fixture();
    const competencyId = map.framework!.competencies[1]!.id;
    const pathway = buildCompetencyPathway(map, competencyId);

    expect(pathway.map((item) => item.yearLevel)).toEqual([3, 4]);
    expect(pathway[0]?.semesters[0]?.courses[0]?.course.code).toBe("TSA301");
    expect(pathway[1]?.semesters[0]?.courses[0]?.pathwayName).toBe(
      "Skill-oriented",
    );
  });

  test("keeps explicit T/U/A and B/I/A text labels", () => {
    const map = fixture();
    const mapping = map.courses[1]!.mappings[0]!;
    expect(compactMappingLabel(mapping)).toBe("T:I U:A A:A");
    expect(levelShort("Basic")).toBe("B");
    expect(compactMappingLabel(null)).toBe("No mapping recorded");
  });
});
