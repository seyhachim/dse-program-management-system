import { describe, expect, test } from "bun:test";
import {
  CourseSpecCompetencyAlignmentSchema,
  CourseSpecCompetencyContextSchema,
  SaveCourseSpecCompetencyEvidenceSchema,
} from "./course-spec-competency.ts";

const source = {
  curriculumId: crypto.randomUUID(),
  curriculumVersionId: crypto.randomUUID(),
  curriculumVersion: "1.0",
  curriculumStatus: "Active" as const,
  placementId: crypto.randomUUID(),
  frameworkVersionId: crypto.randomUUID(),
  frameworkVersion: 1,
  frameworkName: "DSE Graduate Competencies",
};

const expectation = {
  mappingId: crypto.randomUUID(),
  competencyId: crypto.randomUUID(),
  code: "C01",
  name: "Data Analysis",
  description: "Analyze data in authentic contexts",
  ploCodes: ["PLO2", "PLO10"],
  teachLevel: "Intermediate" as const,
  useLevel: "Advanced" as const,
  assessLevel: "Advanced" as const,
  mappingUpdatedAt: new Date().toISOString(),
};

describe("CourseSpec competency contracts", () => {
  test("accepts an authoritative programme expectation context", () => {
    expect(
      CourseSpecCompetencyContextSchema.parse({
        state: "ready",
        message: "resolved",
        source,
        expectations: [expectation],
      }).expectations[0],
    ).toMatchObject({
      code: "C01",
      teachLevel: "Intermediate",
      useLevel: "Advanced",
      assessLevel: "Advanced",
    });
  });

  test("requires unique CLO evidence ids", () => {
    const cloId = crypto.randomUUID();
    expect(
      SaveCourseSpecCompetencyEvidenceSchema.safeParse({
        cloIds: [cloId, cloId],
      }).success,
    ).toBe(false);
  });

  test("keeps traceability status separate from academic level sufficiency", () => {
    const evidenceId = crypto.randomUUID();
    const parsed = CourseSpecCompetencyAlignmentSchema.parse({
      context: {
        state: "ready",
        message: "resolved",
        source,
        expectations: [expectation],
      },
      items: [
        {
          expectation,
          evidence: {
            id: evidenceId,
            sourceMappingId: expectation.mappingId,
            sourceCurriculumVersionId: source.curriculumVersionId,
            sourcePlacementId: source.placementId,
            sourceFrameworkVersionId: source.frameworkVersionId,
            competencyId: expectation.competencyId,
            competencyCode: expectation.code,
            competencyName: expectation.name,
            teachLevel: expectation.teachLevel,
            useLevel: expectation.useLevel,
            assessLevel: expectation.assessLevel,
            linkedCloIds: [crypto.randomUUID()],
            linkedCloCodes: ["CLO1"],
            stale: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          teachStatus: "evidenced",
          useStatus: "missing",
          assessStatus: "evidenced",
          teachingWeeks: [{ id: "week-1", week: 1, topic: "Patterns" }],
          applicationWeeks: [],
          assessments: [
            {
              id: "assessment-1",
              name: "Project",
              weight: 40,
              rubricCriterionCount: 2,
            },
          ],
        },
      ],
      summary: {
        expectedCompetencies: 1,
        evidencedCompetencies: 0,
        needsAttention: 1,
      },
    });

    expect(parsed.items[0]?.useStatus).toBe("missing");
    expect(parsed.items[0]?.expectation.useLevel).toBe("Advanced");
  });
});
