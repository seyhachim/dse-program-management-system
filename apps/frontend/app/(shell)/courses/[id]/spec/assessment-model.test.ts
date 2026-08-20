import { describe, expect, test } from "bun:test";
import {
  assessmentEvidenceLabel,
  assessmentTotalWeight,
  emptyAssessment,
  toAssessmentForm,
  toAssessmentPayload,
} from "./assessment-model.ts";

function assessment(overrides: Partial<ReturnType<typeof emptyAssessment>> = {}) {
  return { ...emptyAssessment(), name: "Assessment", ...overrides };
}

describe("assessment grading and CLO evidence separation", () => {
  test("represents a grade-only attendance component", () => {
    const item = assessment({
      type: "Participation",
      countsTowardGrade: true,
      weight: "10",
      cloCodes: [],
    });
    expect(assessmentEvidenceLabel(item)).toBe("Grade only");
    expect(toAssessmentPayload([item]).items[0]).toMatchObject({ weight: 10, cloCodes: [] });
  });

  test("represents CLO evidence without local grade contribution", () => {
    const item = assessment({
      countsTowardGrade: false,
      weight: "",
      cloCodes: ["CLO1"],
    });
    expect(assessmentEvidenceLabel(item)).toBe("CLO evidence only");
    expect(toAssessmentPayload([item]).items[0]).toMatchObject({ weight: null, cloCodes: ["CLO1"] });
  });

  test("represents formative work as neither grade nor CLO evidence", () => {
    const item = assessment({ countsTowardGrade: false, weight: "", cloCodes: [] });
    expect(assessmentEvidenceLabel(item)).toBe("Formative / neither");
  });

  test("course-grade total excludes non-graded and inactive assessments", () => {
    expect(assessmentTotalWeight([
      assessment({ countsTowardGrade: true, weight: "60" }),
      assessment({ countsTowardGrade: true, weight: "40" }),
      assessment({ countsTowardGrade: false, weight: "99" }),
      assessment({ countsTowardGrade: true, weight: "50", status: "inactive" }),
    ])).toBe(100);
  });

  test("legacy persisted weights derive explicit grade participation", () => {
    const [graded, formative] = toAssessmentForm({
      items: [
        { id: "a", name: "A", type: "Quiz", weight: 20 },
        { id: "b", name: "B", type: "Quiz", weight: null },
      ],
    });
    expect(graded?.countsTowardGrade).toBe(true);
    expect(formative?.countsTowardGrade).toBe(false);
  });
});

describe("Group + Individual assessment form model", () => {
  test("new assessments keep Individual as the backward-compatible default", () => {
    const item = emptyAssessment();
    expect(item.mode).toBe("individual");
    expect(item.groupWeight).toBe("");
    expect(item.individualCriterionIds).toEqual([]);
  });

  test("round-trips weights and individual-scoped rubric criteria", () => {
    const item = assessment({
      id: "assessment-1",
      name: "Capstone",
      mode: "group_individual",
      groupWeight: "70",
      individualWeight: "30",
      individualCriterionIds: ["oral-defense"],
    });
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
    const item = assessment({
      id: "assessment-1",
      name: "Quiz",
      mode: "individual",
      groupWeight: "70",
      individualWeight: "30",
      individualCriterionIds: ["criterion-1"],
    });
    const saved = toAssessmentPayload([item]).items[0]!;
    expect(saved.groupWeight).toBeNull();
    expect(saved.individualWeight).toBeNull();
    expect(saved.individualCriterionIds).toEqual([]);
  });
});
