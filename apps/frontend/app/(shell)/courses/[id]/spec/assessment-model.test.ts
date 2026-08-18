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
