import { expect, test } from "bun:test";
import type { WeeklyPlanForm } from "./weekly-plan-model";
import { duplicateWeeklyPlanWeek } from "./weekly-plan-duplicate";

const plan: WeeklyPlanForm = [
  {
    id: "week-1",
    week: "1",
    topic: "Foundations",
    cloCodes: ["CLO1"],
    lloItems: ["Explain the foundation"],
    lessonLearningOutcomes: [
      { id: "llo-1", description: "Explain the foundation" },
    ],
    activities: ["Discussion"],
    studentLearningActivities: [
      {
        id: "activity-1",
        title: "Discuss",
        description: "Discuss the topic",
        lloIds: ["llo-1"],
      },
    ],
    lectureHours: "2",
    tutorialHours: "1",
    practiceHours: "",
    otherHours: "",
    selfStudyHours: "3",
    teachingMethodIds: ["method-1"],
    teachingResourceTypes: ["slides"],
    assessmentMethodIds: ["assessment-method-1"],
    assessment: "Quiz",
  },
  {
    id: "week-3",
    week: "3",
    topic: "Advanced",
    cloCodes: ["CLO2"],
    lloItems: [],
    lessonLearningOutcomes: [],
    activities: [],
    studentLearningActivities: [],
    lectureHours: "2",
    tutorialHours: "",
    practiceHours: "",
    otherHours: "",
    selfStudyHours: "2",
    teachingMethodIds: [],
    teachingResourceTypes: [],
    assessmentMethodIds: [],
    assessment: "",
  },
];

test("duplicates a week with fresh identities and the next safe week number", () => {
  const duplicatedPlan = duplicateWeeklyPlanWeek(plan, "week-1");
  const duplicate = duplicatedPlan.at(-1);

  expect(duplicatedPlan).toHaveLength(3);
  expect(duplicate?.week).toBe("4");
  expect(duplicate?.id).not.toBe("week-1");
  expect(duplicate?.topic).toBe("Foundations");
  expect(duplicate?.cloCodes).toEqual(["CLO1"]);
  expect(duplicate?.teachingMethodIds).toEqual(["method-1"]);
  expect(duplicate?.assessmentMethodIds).toEqual(["assessment-method-1"]);
});

test("regenerates nested LLO/activity identities and preserves their relationship", () => {
  const duplicatedPlan = duplicateWeeklyPlanWeek(plan, "week-1");
  const duplicate = duplicatedPlan.at(-1)!;
  const copiedLlo = duplicate.lessonLearningOutcomes[0]!;
  const copiedActivity = duplicate.studentLearningActivities[0]!;

  expect(copiedLlo.id).not.toBe("llo-1");
  expect(copiedActivity.id).not.toBe("activity-1");
  expect(copiedActivity.lloIds).toEqual([copiedLlo.id]);

  expect(plan[0]?.lessonLearningOutcomes[0]?.id).toBe("llo-1");
  expect(plan[0]?.studentLearningActivities[0]?.lloIds).toEqual(["llo-1"]);
});

test("returns the original plan when the source week does not exist", () => {
  expect(duplicateWeeklyPlanWeek(plan, "missing")).toBe(plan);
});
