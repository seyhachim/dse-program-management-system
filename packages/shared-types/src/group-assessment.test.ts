import { describe, expect, test } from "bun:test";
import { AssessmentItem } from "./course-spec.ts";

const base = {
  id: "assessment-1",
  name: "Project",
  type: "Project",
  description: "",
  status: "active" as const,
  cloCodes: [],
  weight: 30,
  dueWeek: null,
  durationWeeks: null,
  format: "",
  submissionMethod: "",
  instructions: "",
  rubricId: null,
  criterionCloMappings: [],
  feedbackMethod: "",
  feedbackTimeline: "",
  mappedPlos: [],
  notes: "",
};

describe("assessment group mode contract", () => {
  test("preserves Individual and Group modes", () => {
    expect(AssessmentItem.parse({ ...base, mode: "individual" }).mode).toBe("individual");
    expect(AssessmentItem.parse({ ...base, mode: "group" }).mode).toBe("group");
  });

  test("requires Group + Individual weights to total 100", () => {
    expect(AssessmentItem.safeParse({ ...base, mode: "group_individual", groupWeight: 70, individualWeight: 30 }).success).toBe(true);
    expect(AssessmentItem.safeParse({ ...base, mode: "group_individual", groupWeight: 70, individualWeight: 20 }).success).toBe(false);
    expect(AssessmentItem.safeParse({ ...base, mode: "group_individual" }).success).toBe(false);
  });

  test("stores explicit individual rubric criterion ids", () => {
    const parsed = AssessmentItem.parse({ ...base, mode: "group_individual", groupWeight: 60, individualWeight: 40, individualCriterionIds: ["oral-defense"] });
    expect(parsed.individualCriterionIds).toEqual(["oral-defense"]);
  });
});
