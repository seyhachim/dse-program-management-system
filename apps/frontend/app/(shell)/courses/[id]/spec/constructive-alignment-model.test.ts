import { describe, expect, test } from "bun:test";
import type { CloForm } from "./clo-model";
import type { WeekForm } from "./weekly-plan-model";
import type { AssessmentForm } from "./assessment-model";
import {
  deriveConstructiveAlignmentAudit,
  sortedAlignmentIssues,
} from "./constructive-alignment-model";

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

describe("constructive alignment audit", () => {
  test("derives fully aligned, teaching-only, assessment-only, and not-aligned CLOs", () => {
    const audit = deriveConstructiveAlignmentAudit(
      [clo("CLO1"), clo("CLO2"), clo("CLO3"), clo("CLO4")],
      [week("w1", ["CLO1", "CLO2"])],
      [assessment("a1", ["CLO1", "CLO3"])],
    );

    expect(audit.clos.map((row) => [row.code, row.status])).toEqual([
      ["CLO1", "fullyAligned"],
      ["CLO2", "teachingOnly"],
      ["CLO3", "assessmentOnly"],
      ["CLO4", "notAligned"],
    ]);
    expect(audit.taughtCount).toBe(2);
    expect(audit.assessedCount).toBe(2);
    expect(audit.issueCount).toBe(3);
  });

  test("ignores inactive CLOs and does not count inactive assessments as coverage", () => {
    const audit = deriveConstructiveAlignmentAudit(
      [clo("CLO1"), clo("CLO2", "inactive")],
      [],
      [assessment("a1", ["CLO1"], "inactive")],
    );

    expect(audit.activeCloCount).toBe(1);
    expect(audit.clos[0]?.status).toBe("notAligned");
    expect(audit.clos[0]?.activeAssessments).toHaveLength(0);
    expect(audit.clos[0]?.inactiveAssessments).toHaveLength(1);
  });

  test("reports unmapped source items and source-section availability", () => {
    const audit = deriveConstructiveAlignmentAudit(
      [clo("CLO1")],
      [week("w1", [])],
      [assessment("a1", [])],
    );

    expect(audit.hasWeeklyPlan).toBe(true);
    expect(audit.hasAssessments).toBe(true);
    expect(audit.unmappedWeeks).toHaveLength(1);
    expect(audit.unmappedActiveAssessments).toHaveLength(1);
  });

  test("sorts issues from not aligned to assessment only to teaching only", () => {
    const audit = deriveConstructiveAlignmentAudit(
      [clo("CLO1"), clo("CLO2"), clo("CLO3")],
      [week("w1", ["CLO3"])],
      [assessment("a1", ["CLO2"])],
    );

    expect(sortedAlignmentIssues(audit.clos).map((row) => row.status)).toEqual([
      "notAligned",
      "assessmentOnly",
      "teachingOnly",
    ]);
  });
});