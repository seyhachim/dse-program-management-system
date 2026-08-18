import { describe, expect, test } from "bun:test";
import {
  CurriculumRequestChangesSchema,
  CurriculumWorkflowStateSchema,
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
});
