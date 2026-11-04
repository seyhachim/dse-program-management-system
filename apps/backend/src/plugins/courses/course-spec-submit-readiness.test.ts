import { describe, expect, test } from "bun:test";
import {
  courseSpecSubmissionGaps,
  type CourseSpecSubmissionSource,
} from "./course-spec-submit-readiness.ts";

const instruction = {
  topic: "Time series visualisation",
  cloCodes: ["CLO1"],
  lloItems: ["Interpret the monthly time-series graph"],
  lessonLearningOutcomes: [],
  activities: ["Data investigation"],
  studentLearningActivities: [],
  lectureHours: 2,
  tutorialHours: 0,
  practiceHours: 2,
  otherHours: 0,
  selfStudyHours: 2,
  teachingMethodIds: ["tm-1"],
  assessmentMethodIds: ["am-1"],
  assessment: "",
};

const ready: CourseSpecSubmissionSource = {
  sections: [
    { sectionKey: "courseInfo", status: "Complete" },
    { sectionKey: "clos", status: "Complete" },
    { sectionKey: "assessmentPlan", status: "Complete" },
    { sectionKey: "resources", status: "Complete" },
    { sectionKey: "references", status: "Complete" },
    { sectionKey: "policy", status: "Complete" },
    { sectionKey: "slt", status: "Draft" },
    { sectionKey: "mapping", status: "Draft" },
    { sectionKey: "responsibility", status: "Complete" },
    { sectionKey: "date", status: "Draft" },
  ],
  clos: [
    {
      order: 0,
      description: "Analyse temporal patterns",
      status: "Active",
      mappedPlos: ["PLO1"],
      teachingMethods: [{ teachingMethodId: "tm-1" }],
    },
  ],
  weeks: [
    instruction,
    {
      ...instruction,
      topic: "Midterm Exam",
      cloCodes: [],
      lloItems: [],
      activities: [],
      teachingMethodIds: [],
      assessmentMethodIds: [],
      lectureHours: 0,
      practiceHours: 0,
      selfStudyHours: 0,
      assessment: "",
    },
    {
      ...instruction,
      topic: "Final Exam",
      cloCodes: [],
      lloItems: [],
      activities: [],
      teachingMethodIds: [],
      assessmentMethodIds: [],
      lectureHours: 0,
      practiceHours: 0,
      selfStudyHours: 0,
      assessment: "",
    },
  ],
  assessmentItems: [{ status: "Active", cloCodes: ["CLO1"] }],
  teachingLearning: {
    philosophyTags: ["Student-centred"],
    philosophyStatement: "",
    teachingMethodIds: ["tm-1"],
    activeLearningStrategyIds: ["data-investigation"],
    independentLearningTypes: [],
    resourceTypes: [],
    technologyTypes: [],
  },
};

describe("CourseSpec authoritative submission readiness", () => {
  test("accepts canonical ready sources despite stale SLT/mapping/date flags", () => {
    expect(courseSpecSubmissionGaps(ready)).toEqual([]);
  });

  test("rejects a missing current Teaching & Learning philosophy despite a saved complete flag", () => {
    const gaps = courseSpecSubmissionGaps({
      ...ready,
      sections: [
        ...ready.sections,
        { sectionKey: "teachingLearning", status: "Complete" },
      ],
      teachingLearning: { ...ready.teachingLearning!, philosophyTags: [] },
    });
    expect(gaps).toContain("Teaching & Learning");
  });

  test("rejects instructional weeks with no teaching method even when saved SLT is Complete", () => {
    expect(courseSpecSubmissionGaps({
      ...ready,
      sections: [
        ...ready.sections,
        { sectionKey: "slt", status: "Complete" },
      ],
      weeks: [{ ...instruction, teachingMethodIds: [] }],
    })).toContain("Weekly Plan");
  });

  test("inactive assessments do not satisfy active CLO alignment", () => {
    expect(courseSpecSubmissionGaps({
      ...ready,
      assessmentItems: [{ status: "Inactive", cloCodes: ["CLO1"] }],
    })).toContain("CLO Alignment Mapping");
  });

  test("active CLOs must have a taught week and active assessment", () => {
    expect(courseSpecSubmissionGaps({
      ...ready,
      clos: [
        ...ready.clos,
        {
          order: 1,
          description: "Evaluate forecasting models",
          status: "Active",
          mappedPlos: ["PLO2"],
          teachingMethods: [{ teachingMethodId: "tm-1" }],
        },
      ],
    })).toContain("CLO Alignment Mapping");
  });

  test("rejects an unsaved mandatory assessment section", () => {
    expect(courseSpecSubmissionGaps({
      ...ready,
      sections: ready.sections.filter((section) => section.sectionKey !== "assessmentPlan"),
    })).toContain("Course Assessment Plan");
  });
});
