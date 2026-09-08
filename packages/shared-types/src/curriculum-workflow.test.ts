import { describe, expect, test } from "bun:test";
import {
  CurriculumRequestChangesSchema,
  CurriculumWorkflowStateSchema,
  UpdateCurriculumWorkflowMetadataSchema,
} from "./curriculum-workflow.ts";

describe("curriculum workflow contracts", () => {
  test("supports the reviewed lifecycle state and backend action list", () => {
    const state = CurriculumWorkflowStateSchema.parse({
      curriculumId: crypto.randomUUID(),
      versionId: crypto.randomUUID(),
      status: "UnderReview",
      allowedActions: ["requestChanges", "approve"],
      lastComment: "Ready",
    });
    expect(state.status).toBe("UnderReview");
  });

  test("requires a reason when changes are requested", () => {
    expect(CurriculumRequestChangesSchema.safeParse({ comment: "" }).success).toBe(false);
  });

  test("requires cohort label and academic year when saving review metadata", () => {
    expect(
      UpdateCurriculumWorkflowMetadataSchema.safeParse({
        cohortLabel: "",
        academicYear: "2026-2027",
      }).success,
    ).toBe(false);
    expect(
      UpdateCurriculumWorkflowMetadataSchema.safeParse({
        cohortLabel: "Cohort 2026",
        academicYear: "",
      }).success,
    ).toBe(false);
    expect(
      UpdateCurriculumWorkflowMetadataSchema.safeParse({
        cohortLabel: "  Cohort 2026  ",
        academicYear: "  2026-2027  ",
      }).success,
    ).toBe(true);
  });
});
