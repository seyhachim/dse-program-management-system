import { describe, expect, test } from "bun:test";
import { emptyAssessment, toAssessmentForm, toAssessmentPayload } from "./assessment-model";

describe("Group + Individual assessment form model", () => {
  test("new assessments keep Individual as the backward-compatible default", () => {
    const item = emptyAssessment();
    expect(item.mode).toBe("individual");
    expect(item.groupWeight).toBe("");
    expect(item.individualCriterionIds).toEqual([]);
  });

  test("round-trips weights and individual-scoped rubric criteria", () => {
    const item = {
      ...emptyAssessment(),
      id: "assessment-1",
      name: "Capstone",
      mode: "group_individual" as const,
      groupWeight: "70",
      individualWeight: "30",
      individualCriterionIds: ["oral-defense"],
    };
    const payload = toAssessmentPayload([item]);
    expect(payload.items[0]?.mode).toBe("group_individual");
    expect(payload.items[0]?.groupWeight).toBe(70);
    expect(payload.items[0]?.individualWeight).toBe(30);
    expect(payload.items[0]?.individualCriterionIds).toEqual(["oral-defense"]);

    const roundTrip = toAssessmentForm(payload)[0]!;
    expect(roundTrip.mode).toBe("group_individual");
    expect(roundTrip.groupWeight).toBe("70");
    expect(roundTrip.individualWeight).toBe("30");
    expect(roundTrip.individualCriterionIds).toEqual(["oral-defense"]);
  });

  test("clears group-only metadata from non-combined payloads", () => {
    const item = {
      ...emptyAssessment(),
      id: "assessment-1",
      name: "Quiz",
      mode: "individual" as const,
      groupWeight: "70",
      individualWeight: "30",
      individualCriterionIds: ["criterion-1"],
    };
    const saved = toAssessmentPayload([item]).items[0]!;
    expect(saved.groupWeight).toBeNull();
    expect(saved.individualWeight).toBeNull();
    expect(saved.individualCriterionIds).toEqual([]);
  });
});
