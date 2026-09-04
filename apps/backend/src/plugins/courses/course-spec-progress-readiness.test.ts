import { describe, expect, test } from "bun:test";
import type { CourseSpecProgress } from "@dse-pms/shared-types";
import {
  applyCurrentCourseSpecReadiness,
  enrichCourseSpecProgress,
  type CourseSpecProgressReadinessSnapshot,
} from "./course-spec-progress-readiness.ts";

const baseProgress: CourseSpecProgress = {
  courseId: "course-1",
  code: "PAN202",
  title: "Predictive Analytics",
  completed: 8,
  total: 10,
  curriculumPlacement: null,
  incompleteSections: [
    { id: "mapping", title: "CLO Alignment Mapping" },
    { id: "date", title: "Date" },
  ],
};

const readySnapshot: CourseSpecProgressReadinessSnapshot = {
  sections: [
    { sectionKey: "courseInfo", status: "Complete" },
    { sectionKey: "clos", status: "Complete" },
    { sectionKey: "assessmentPlan", status: "Complete" },
    { sectionKey: "slt", status: "Complete" },
    { sectionKey: "mapping", status: "Draft" },
    { sectionKey: "resources", status: "Complete" },
    { sectionKey: "references", status: "Complete" },
    { sectionKey: "responsibility", status: "Complete" },
    { sectionKey: "policy", status: "Complete" },
    { sectionKey: "date", status: "Draft" },
  ],
  clos: [
    {
      order: 0,
      description: "Apply predictive modelling methods",
      status: "Active",
      mappedPlos: ["PLO1"],
      teachingMethods: [{ teachingMethodId: "tm-1" }],
    },
  ],
  weeks: [
    {
      topic: "Regression modelling",
      cloCodes: ["CLO1"],
      lloItems: ["Fit and evaluate a regression model"],
      lessonLearningOutcomes: [],
      activities: ["Lab Exercise"],
      studentLearningActivities: [],
      lectureHours: 2,
      tutorialHours: 0,
      practiceHours: 1,
      otherHours: 0,
      selfStudyHours: 2,
      teachingMethodIds: ["tm-1"],
      assessmentMethodIds: ["am-1"],
      assessment: "",
    },
  ],
  assessmentItems: [{ status: "Active", cloCodes: ["CLO1"] }],
  teachingLearning: {
    courseSpecId: "spec-1",
    philosophyTags: ["Student-centred"],
    philosophyStatement: "",
    teachingMethodIds: ["tm-1"],
    activeLearningStrategyIds: ["al-1"],
    independentLearningTypes: [],
    resourceTypes: [],
    technologyTypes: [],
    updatedAt: new Date("2026-09-04T00:00:00.000Z"),
  },
};

describe("CourseSpec progress readiness enrichment", () => {
  test("recomputes the reported list 80% state as 100% when current Overview sources are ready", () => {
    const progress = applyCurrentCourseSpecReadiness(baseProgress, readySnapshot);
    expect(progress.total).toBe(10);
    expect(progress.completed).toBe(10);
    expect(progress.incompleteSections).toEqual([]);
  });

  test("reports a real alignment gap rather than trusting persisted mapping status", () => {
    const progress = applyCurrentCourseSpecReadiness(baseProgress, {
      ...readySnapshot,
      assessmentItems: [{ status: "Inactive", cloCodes: ["CLO1"] }],
    });
    expect(progress.completed).toBe(9);
    expect(progress.incompleteSections).toEqual([
      { id: "mapping", title: "CLO Alignment Mapping" },
    ]);
  });

  test("does not query the database for an empty already-authorized progress set", async () => {
    expect(await enrichCourseSpecProgress([])).toEqual([]);
  });
});
