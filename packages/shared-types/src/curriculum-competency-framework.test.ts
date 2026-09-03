import { describe, expect, test } from "bun:test";
import {
  BindProgrammeCurriculumCompetencyFrameworkSchema,
  CreateProgrammeCompetencyFrameworkVersionSchema,
  ProgrammeCompetencyFrameworkVersionSchema,
} from "./curriculum.ts";

describe("curriculum competency framework contracts", () => {
  test("accepts a strict framework snapshot request", () => {
    expect(
      CreateProgrammeCompetencyFrameworkVersionSchema.parse({
        code: "dse-graduate-competencies",
        name: "DSE Graduate Competencies",
        changeNote: "2026 curriculum baseline",
      }),
    ).toEqual({
      code: "dse-graduate-competencies",
      name: "DSE Graduate Competencies",
      changeNote: "2026 curriculum baseline",
    });
    expect(() =>
      CreateProgrammeCompetencyFrameworkVersionSchema.parse({ code: "x", name: "X", extra: true }),
    ).toThrow();
  });

  test("requires UUID framework versions for curriculum assignment", () => {
    expect(BindProgrammeCurriculumCompetencyFrameworkSchema.safeParse({ frameworkVersionId: "nope" }).success).toBe(false);
  });

  test("preserves competency and PLO snapshot context", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const parsed = ProgrammeCompetencyFrameworkVersionSchema.parse({
      frameworkId: id,
      programmeId: "dse",
      frameworkCode: "graduate",
      frameworkVersionId: "00000000-0000-4000-8000-000000000002",
      version: 1,
      name: "Graduate Competencies",
      changeNote: "baseline",
      createdById: "00000000-0000-4000-8000-000000000003",
      createdAt: "2026-09-03T00:00:00.000Z",
      competencies: [
        { id: "00000000-0000-4000-8000-000000000004", code: "C1", name: "Analysis", description: null, order: 1, sourceActive: true, ploCodes: ["PLO1"] },
      ],
    });
    expect(parsed.competencies[0]?.ploCodes).toEqual(["PLO1"]);
  });
});
