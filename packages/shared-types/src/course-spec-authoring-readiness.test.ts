import { describe, expect, test } from "bun:test";
import type { SpecSectionStatus, TeachingLearningProfile } from "./course-spec.ts";
import {
  COURSE_SPEC_AUTHORING_SECTIONS,
  courseSpecInstructionalWeeks,
  courseSpecSessionType,
  courseSpecWeeklyPlanWeekAttention,
  isCourseSpecWeeklyPlanReady,
  deriveCourseSpecAuthoringReadinessStatus,
  summarizeCourseSpecAuthoringReadiness,
  type CourseSpecReadinessAssessment,
  type CourseSpecReadinessClo,
  type CourseSpecReadinessWeek,
} from "./course-spec-authoring-readiness.ts";

const persistedComplete: Record<string, SpecSectionStatus> = {
  courseInfo: "complete",
  clos: "complete",
  assessmentPlan: "complete",
  slt: "complete",
  mapping: "draft",
  resources: "complete",
  references: "complete",
  responsibility: "complete",
  policy: "complete",
  date: "draft",
};

const clos: CourseSpecReadinessClo[] = [
  {
    code: "CLO1",
    description: "Apply predictive modelling methods",
    mappedPlos: ["PLO1"],
    teachingMethodIds: ["tm-1"],
    status: "active",
  },
];

const readyWeek: CourseSpecReadinessWeek = {
  topic: "Regression modelling",
  cloCodes: ["CLO1"],
  lloItems: ["Fit and evaluate a regression model"],
  lessonLearningOutcomes: [],
  activities: ["Lab Exercise"],
  studentLearningActivities: [],
  lectureHours: "2",
  tutorialHours: "0",
  practiceHours: "1",
  otherHours: "0",
  selfStudyHours: "2",
  teachingMethodIds: ["tm-1"],
  assessmentMethodIds: ["am-1"],
  assessment: "",
};

const activeAssessment: CourseSpecReadinessAssessment = {
  status: "active",
  cloCodes: ["CLO1"],
};

const readyProfile: TeachingLearningProfile = {
  philosophyTags: ["Student-centred"],
  philosophyStatement: "",
  teachingMethodIds: ["tm-1"],
  activeLearningStrategyIds: ["al-1"],
  independentLearningTypes: [],
  resourceTypes: [],
  technologyTypes: [],
};

function derive(
  cloRows = clos,
  weeks: CourseSpecReadinessWeek[] = [readyWeek],
  assessments: CourseSpecReadinessAssessment[] = [activeAssessment],
  profile: TeachingLearningProfile | null = readyProfile,
) {
  return deriveCourseSpecAuthoringReadinessStatus(
    persistedComplete,
    cloRows,
    weeks,
    assessments,
    { teachingLearningProfile: profile },
  );
}

describe("CourseSpec authoring readiness", () => {
  test("uses the same 10 lecturer-work sections as Overview", () => {
    expect(COURSE_SPEC_AUTHORING_SECTIONS.map((section) => section.id)).toEqual([
      "courseInfo",
      "clos",
      "teachingLearning",
      "assessmentPlan",
      "slt",
      "mapping",
      "resources",
      "references",
      "responsibility",
      "policy",
    ]);
  });

  test("turns the reported stale mapping/date 8/10 state into current 10/10 readiness", () => {
    const summary = summarizeCourseSpecAuthoringReadiness(derive());
    expect(summary.total).toBe(10);
    expect(summary.completed).toBe(10);
    expect(summary.incompleteSections).toEqual([]);
  });

  test("derives CLO readiness from current description and PLO mapping", () => {
    const status = derive([{ ...clos[0]!, mappedPlos: [] }]);
    expect(status.clos).toBe("draft");
    expect(
      summarizeCourseSpecAuthoringReadiness(status).incompleteSections.map(
        (section) => section.id,
      ),
    ).toContain("clos");
  });

  test("includes current Teaching & Learning readiness instead of automatic Date", () => {
    const status = derive(clos, [readyWeek], [activeAssessment], {
      ...readyProfile,
      activeLearningStrategyIds: [],
    });
    const incomplete = summarizeCourseSpecAuthoringReadiness(
      status,
    ).incompleteSections.map((section) => section.id);
    expect(incomplete).toContain("teachingLearning");
    expect(incomplete).not.toContain("date");
  });

  test("ignores preserved Midterm/Final assessment-only rows for Weekly Plan readiness and teaching alignment", () => {
    const legacyMidterm: CourseSpecReadinessWeek = {
      topic: "Midterm Exam",
      cloCodes: [],
      lloItems: [],
      lessonLearningOutcomes: [],
      activities: [],
      studentLearningActivities: [],
      lectureHours: 0,
      tutorialHours: 0,
      practiceHours: 0,
      otherHours: 0,
      selfStudyHours: 0,
      teachingMethodIds: [],
      assessmentMethodIds: [],
      assessment: "",
    };
    const weeks = [readyWeek, legacyMidterm];
    expect(courseSpecInstructionalWeeks(weeks)).toEqual([readyWeek]);
    const status = derive(clos, weeks);
    expect(status.slt).toBe("complete");
    expect(status.mapping).toBe("complete");
  });

  test("keeps a genuine instructional Weekly Plan gap incomplete", () => {
    const status = derive(clos, [{ ...readyWeek, lloItems: [] }]);
    expect(status.slt).toBe("draft");
  });

  test("inactive assessments do not satisfy Constructive Alignment", () => {
    const status = derive(clos, [readyWeek], [
      { ...activeAssessment, status: "inactive" },
    ]);
    expect(status.mapping).toBe("draft");
  });
});

describe("session-aware Weekly Plan validation", () => {
  const teaching: CourseSpecReadinessWeek = { ...readyWeek, sessionType: "teaching", assessmentMethodIds: [], assessment: "" };
  const assessment: CourseSpecReadinessWeek = { ...teaching, topic: "Midterm Exam", sessionType: "assessment", lloItems: [], activities: [], teachingMethodIds: [], lectureHours: 0, practiceHours: 3, selfStudyHours: 0, assessment: "Midterm Exam" };
  test("teaching without an assessment is valid, including legacy teaching rows", () => {
    expect(courseSpecWeeklyPlanWeekAttention(teaching)).toEqual([]);
    expect(courseSpecWeeklyPlanWeekAttention({ ...teaching, sessionType: undefined })).toEqual([]);
    expect(derive(clos, [teaching]).slt).toBe("complete");
  });
  test("assessment-only sessions do not require LLOs, teaching or activities", () => {
    expect(courseSpecWeeklyPlanWeekAttention(assessment)).toEqual([]);
    expect(isCourseSpecWeeklyPlanReady([teaching, assessment])).toBe(true);
    expect(courseSpecInstructionalWeeks([teaching, assessment])).toEqual([teaching]);
    expect(courseSpecSessionType({ ...assessment, sessionType: null })).toBe("assessment");
    expect(courseSpecWeeklyPlanWeekAttention({ ...assessment, assessment: "" })).toEqual(["Assessment"]);
    expect(isCourseSpecWeeklyPlanReady([teaching, { ...assessment, assessment: "" }])).toBe(false);
  });
  test("mixed sessions require both teaching and assessment evidence", () => {
    expect(courseSpecWeeklyPlanWeekAttention({ ...teaching, sessionType: "teaching_and_assessment" })).toEqual(["Assessment"]);
    expect(courseSpecWeeklyPlanWeekAttention({ ...teaching, sessionType: "teaching_and_assessment", assessmentMethodIds: ["am"] })).toEqual([]);
    expect(courseSpecWeeklyPlanWeekAttention({ ...assessment, sessionType: "teaching_and_assessment" })).toEqual(["LLO", "Teaching method", "Learning activity"]);
  });
  test("explicit type overrides title inference; CLO and hours still required", () => {
    expect(courseSpecSessionType({ ...teaching, topic: "Final Exam" })).toBe("teaching");
    expect(courseSpecWeeklyPlanWeekAttention({ ...assessment, cloCodes: [], lectureHours: 0, tutorialHours: 0, practiceHours: 0, otherHours: 0, selfStudyHours: 0 })).toEqual(["CLO", "Learning time"]);
  });
});
