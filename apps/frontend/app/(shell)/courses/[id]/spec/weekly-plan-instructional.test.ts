import { describe, expect, it } from "bun:test";

import {
  emptyWeek,
  instructionalWeeklyPlan,
  isAssessmentOnlyWeek,
  mergeInstructionalWeeklyPlan,
  toWeeklyPlanPayload,
  toWeeklyPlanForm,
  type WeekForm,
} from "./weekly-plan-model";

function week(number: number, topic: string): WeekForm {
  return {
    id: `week-${number}-${topic}`,
    week: String(number),
    topic,
    cloCodes: ["CLO1"],
    lloItems: ["Outcome"],
    lessonLearningOutcomes: [{ id: `llo-${number}`, description: "Outcome" }],
    activities: ["Activity"],
    studentLearningActivities: [],
    lectureHours: "2",
    tutorialHours: "",
    practiceHours: "",
    otherHours: "",
    selfStudyHours: "2",
    teachingMethodIds: ["method"],
    teachingResourceTypes: [],
    assessmentMethodIds: ["assessment"],
    assessment: "",
  };
}

describe("instructional Weekly Plan", () => {
  it("recognizes legacy Midterm and Final Exam rows as assessment-only", () => {
    expect(isAssessmentOnlyWeek(week(8, "Midterm Exam"))).toBe(true);
    expect(
      isAssessmentOnlyWeek(week(16, "Final Exam: Presentation (Defence)")),
    ).toBe(true);
    expect(isAssessmentOnlyWeek(week(4, "Model Evaluation"))).toBe(false);
  });

  it("retains all instructional weeks rather than truncating at fourteen", () => {
    const plan = Array.from({ length: 16 }, (_, index) =>
      week(index + 1, `Teaching topic ${index + 1}`),
    );
    const instructional = instructionalWeeklyPlan(plan);
    expect(instructional).toHaveLength(16);
    expect(instructional.at(-1)?.week).toBe("16");
  });

  it("preserves hidden assessment-only legacy rows when instructional weeks are edited", () => {
    const midterm = week(8, "Midterm Exam");
    const finalExam = week(16, "Final Exam: Presentation (Defence)");
    const original = [week(1, "Intro"), midterm, week(2, "EDA"), finalExam];
    const edited = [week(1, "Updated Intro"), week(2, "EDA")];

    const merged = mergeInstructionalWeeklyPlan(original, edited);
    expect(merged.some((item) => item.id === midterm.id)).toBe(true);
    expect(merged.some((item) => item.id === finalExam.id)).toBe(true);
    expect(merged.some((item) => item.topic === "Updated Intro")).toBe(true);
  });

  it("adds into the first available week number", () => {
    const next = emptyWeek([week(1, "Intro"), week(3, "EDA")]);
    expect(next.week).toBe("2");
  });
});

it("explicit session classification survives payload round-trip and controls instructional totals", () => {
  const exam = { ...week(8, "Practical demonstration"), sessionType: "assessment" as const };
  const teaching = { ...week(9, "Final Exam preparation"), sessionType: "teaching" as const };
  const rows = toWeeklyPlanForm(toWeeklyPlanPayload([exam, teaching]));
  expect(rows.map((row) => row.sessionType)).toEqual(["assessment", "teaching"]);
  expect(instructionalWeeklyPlan(rows).map((row) => row.id)).toEqual([teaching.id]);
  expect(emptyWeek([week(1, "Intro"), exam]).sessionType).toBe("teaching");
});
