import { describe, expect, test } from "bun:test";
import type { SpecSectionStatus } from "@dse-pms/shared-types";
import type { AssessmentForm } from "./assessment-model";
import type { CloForm } from "./clo-model";
import { deriveOverviewReadinessStatus } from "./overview-readiness";
import { OVERVIEW_REQUIRED_SECTIONS } from "./overview-sections";
import type { WeekForm } from "./weekly-plan-model";

const completeStatus: Record<string, SpecSectionStatus> = {
  courseInfo: "complete",
  clos: "complete",
  assessmentPlan: "complete",
  slt: "complete",
  mapping: "complete",
  resources: "complete",
  references: "complete",
  responsibility: "complete",
  policy: "complete",
  date: "complete",
};

const clos: CloForm[] = [
  {
    id: "clo-1",
    code: "CLO1",
    description: "Apply a method",
    level: "C3",
    mappedPlos: ["PLO1"],
    sltHours: "10",
    teachingMethodIds: ["tm-1"],
    activeLearningStrategyIds: [],
    assessmentMethodIds: [],
    status: "active",
    notes: "",
  },
];

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

const assessments: AssessmentForm[] = [
  {
    id: "assessment-1",
    name: "Assignment",
    type: "Assignment",
    description: "",
    mode: "individual",
    groupWeight: "",
    individualWeight: "",
    individualCriterionIds: [],
    status: "active",
    cloCodes: ["CLO1"],
    countsTowardGrade: true,
    weight: "20",
    dueWeek: "",
    durationWeeks: "",
    format: "",
    submissionMethod: "",
    instructions: "",
    rubricId: "",
    criterionCloMappings: [],
    feedbackMethod: "",
    feedbackTimeline: "",
    mappedPlos: [],
    notes: "",
    assessmentCategory: "continuous",
    topicNumbers: [],
    physicalSltHours: "",
    onlineSltHours: "",
    independentSltHours: "",
  },
];

function summary(status: Record<string, SpecSectionStatus>) {
  const completed = OVERVIEW_REQUIRED_SECTIONS.filter(
    (section) => status[section.id] === "complete",
  ).length;
  const unfinished = OVERVIEW_REQUIRED_SECTIONS.filter(
    (section) => status[section.id] !== "complete",
  );
  return { completed, total: OVERVIEW_REQUIRED_SECTIONS.length, unfinished };
}

describe("overview readiness flow", () => {
  test("Teaching & Learning attention changes a persisted 10/10 view to 9/10 and becomes next step", () => {
    const effective = deriveOverviewReadinessStatus(
      completeStatus,
      clos,
      [readyWeek],
      assessments,
      { cloReady: true, teachingLearningReady: false },
    );
    const result = summary(effective);

    expect(result.total).toBe(10);
    expect(result.completed).toBe(9);
    expect(result.unfinished[0]?.id).toBe("teachingLearning");
  });

  test("Weekly Plan attention changes a persisted 10/10 view to 9/10 and becomes next step", () => {
    const incompleteWeek: WeekForm = {
      ...readyWeek,
      lloItems: [],
      teachingMethodIds: [],
    };
    const effective = deriveOverviewReadinessStatus(
      completeStatus,
      clos,
      [incompleteWeek],
      assessments,
      { cloReady: true, teachingLearningReady: true },
    );
    const result = summary(effective);

    expect(result.total).toBe(10);
    expect(result.completed).toBe(9);
    expect(result.unfinished[0]?.id).toBe("slt");
  });

  test("Ready for review is possible only when all derived required work is ready", () => {
    const effective = deriveOverviewReadinessStatus(
      completeStatus,
      clos,
      [readyWeek],
      assessments,
      { cloReady: true, teachingLearningReady: true },
    );
    const result = summary(effective);

    expect(result.completed).toBe(result.total);
    expect(result.unfinished).toHaveLength(0);
  });
});
