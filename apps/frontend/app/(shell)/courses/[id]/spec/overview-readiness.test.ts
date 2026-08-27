import { describe, expect, test } from "bun:test";
import type { SpecSectionStatus } from "@dse-pms/shared-types";
import type { AssessmentForm } from "./assessment-model";
import type { CloForm } from "./clo-model";
import { deriveOverviewReadinessStatus } from "./overview-readiness";
import type { WeekForm } from "./weekly-plan-model";

const clo = (code: string, status: CloForm["status"] = "active"): CloForm => ({
  id: code,
  code,
  description: `${code} description`,
  level: "C3",
  mappedPlos: ["PLO1"],
  sltHours: "10",
  teachingMethodIds: [],
  activeLearningStrategyIds: [],
  assessmentMethodIds: [],
  status,
  notes: "",
});

const week = (id: string, cloCodes: string[]): WeekForm => ({
  id,
  week: id.replace("w", ""),
  topic: `Topic ${id}`,
  cloCodes,
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
});

const assessment = (
  id: string,
  cloCodes: string[],
  status: AssessmentForm["status"] = "active",
): AssessmentForm => ({
  id,
  name: `Assessment ${id}`,
  type: "Assignment",
  description: "",
  mode: "individual",
  groupWeight: "",
  individualWeight: "",
  individualCriterionIds: [],
  status,
  cloCodes,
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
});

const baseStatus: Record<string, SpecSectionStatus> = {
  courseInfo: "complete",
  clos: "complete",
  teachingLearning: "complete",
  assessmentPlan: "complete",
  slt: "complete",
};

describe("overview readiness", () => {
  test("overrides stale missing mapping status when source data is fully aligned", () => {
    const status = deriveOverviewReadinessStatus(
      baseStatus,
      [clo("CLO1"), clo("CLO2")],
      [week("w1", ["CLO1", "CLO2"])],
      [assessment("a1", ["CLO1", "CLO2"])],
    );

    expect(status.mapping).toBe("complete");
  });

  test("overrides stale complete mapping status when an active CLO has a coverage gap", () => {
    const status = deriveOverviewReadinessStatus(
      { ...baseStatus, mapping: "complete" },
      [clo("CLO1"), clo("CLO2")],
      [week("w1", ["CLO1", "CLO2"])],
      [assessment("a1", ["CLO1"])],
    );

    expect(status.mapping).toBe("draft");
  });

  test("inactive assessments do not satisfy alignment readiness", () => {
    const status = deriveOverviewReadinessStatus(
      { ...baseStatus, mapping: "complete" },
      [clo("CLO1")],
      [week("w1", ["CLO1"])],
      [assessment("a1", ["CLO1"], "inactive")],
    );

    expect(status.mapping).toBe("draft");
  });

  test("zero active CLOs cannot retain a stale complete mapping status", () => {
    const status = deriveOverviewReadinessStatus(
      { ...baseStatus, mapping: "complete" },
      [clo("CLO1", "inactive")],
      [],
      [],
    );

    expect(status.mapping).toBeUndefined();
  });
});
