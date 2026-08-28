import { describe, expect, test } from "bun:test";
import type { WeekForm } from "./weekly-plan-model";
import {
  weeklyPlanIsReady,
  weeklyPlanWeekAttention,
} from "./weekly-plan-readiness";

const readyWeek: WeekForm = {
  id: "week-1",
  week: "1",
  topic: "Topic 1",
  cloCodes: ["CLO1"],
  lloItems: ["Explain the weekly concept"],
  lessonLearningOutcomes: [],
  activities: ["Guided practice"],
  studentLearningActivities: [],
  lectureHours: "2",
  tutorialHours: "",
  practiceHours: "",
  otherHours: "",
  selfStudyHours: "2",
  teachingMethodIds: ["tm-1"],
  teachingResourceTypes: [],
  assessmentMethodIds: ["am-1"],
  assessment: "",
};

describe("weekly plan readiness", () => {
  test("matches Weekly Plan attention semantics for lesson outcomes and teaching methods", () => {
    const attention = weeklyPlanWeekAttention({
      ...readyWeek,
      lloItems: [],
      teachingMethodIds: [],
    });

    expect(attention).toContain("LLO");
    expect(attention).toContain("Teaching method");
  });

  test("requires every planned week to have no attention items", () => {
    expect(weeklyPlanIsReady([readyWeek])).toBe(true);
    expect(
      weeklyPlanIsReady([
        readyWeek,
        { ...readyWeek, id: "week-2", week: "2", lloItems: [] },
      ]),
    ).toBe(false);
  });

  test("an empty weekly plan is not ready", () => {
    expect(weeklyPlanIsReady([])).toBe(false);
  });
});
