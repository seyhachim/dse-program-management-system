import { describe, expect, test } from "bun:test";
import {
  CurriculumCompetencyMapSchema,
  UpdateCurriculumCourseCompetencyMappingSchema,
} from "./curriculum.ts";

describe("curriculum competency map contracts", () => {
  test("accepts independent Teach / Use / Assess levels", () => {
    expect(
      UpdateCurriculumCourseCompetencyMappingSchema.parse({
        teachLevel: "Basic",
        useLevel: "Intermediate",
        assessLevel: "Advanced",
        note: "Programme mapping review",
      }),
    ).toEqual({
      teachLevel: "Basic",
      useLevel: "Intermediate",
      assessLevel: "Advanced",
      note: "Programme mapping review",
    });
  });

  test("all-null input is valid and represents clearing the mapping", () => {
    expect(UpdateCurriculumCourseCompetencyMappingSchema.parse({})).toEqual({
      teachLevel: null,
      useLevel: null,
      assessLevel: null,
      note: "",
    });
  });

  test("rejects unsupported level labels", () => {
    expect(() =>
      UpdateCurriculumCourseCompetencyMappingSchema.parse({
        teachLevel: "Mastered",
      }),
    ).toThrow();
  });

  test("validates a version-scoped map read", () => {
    const versionId = crypto.randomUUID();
    const placementId = crypto.randomUUID();
    const competencyId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    const frameworkId = crypto.randomUUID();
    const frameworkVersionId = crypto.randomUUID();

    const parsed = CurriculumCompetencyMapSchema.parse({
      curriculumVersion: {
        id: versionId,
        status: "Draft",
        version: "1.0",
      },
      framework: {
        frameworkId,
        programmeId: "dse",
        frameworkCode: "dse-graduate-competencies",
        frameworkVersionId,
        version: 1,
        name: "DSE Graduate Competencies",
        changeNote: "",
        createdById: actorId,
        createdAt: new Date().toISOString(),
        assignedById: actorId,
        assignedAt: new Date().toISOString(),
        competencies: [
          {
            id: competencyId,
            code: "C1",
            name: "Python Programming for Data Science",
            description: null,
            order: 1,
            sourceActive: true,
            ploCodes: ["PLO1"],
          },
        ],
      },
      courses: [
        {
          placementId,
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
              placementId,
              competencyId,
              teachLevel: "Intermediate",
              useLevel: "Advanced",
              assessLevel: "Advanced",
              note: "",
              updatedById: actorId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      ],
      pathways: [],
      summary: {
        courseCount: 1,
        competencyCount: 1,
        mappedCourseCount: 1,
        unmappedCourseCount: 0,
        mappedCompetencyCount: 1,
        unmappedCompetencyCount: 0,
      },
    });

    expect(parsed.courses[0]?.mappings[0]?.assessLevel).toBe("Advanced");
  });
});
