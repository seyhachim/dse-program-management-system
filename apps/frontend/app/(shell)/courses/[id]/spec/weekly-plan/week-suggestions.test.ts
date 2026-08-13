/// <reference types="bun" />

import { expect, test } from "bun:test";
import type { Method, TeachingLearningProfile } from "@dse-pms/shared-types";
import type { AssessmentForm } from "../assessment-model";
import type { CloForm } from "../clo-model";
import { buildWeekSuggestions } from "./week-suggestions";

const teachingMethods = [
  { id: "lecture", name: "Lecture" },
  { id: "lab", name: "Lab" },
] as Method[];

const profile: TeachingLearningProfile = {
  philosophyTags: ["applied"],
  philosophyStatement: "",
  teachingMethodIds: ["lecture", "lab"],
  activeLearningStrategyIds: ["peer-review", "coding-exercise"],
  independentLearningTypes: ["Project Work"],
  resourceTypes: ["Datasets"],
  technologyTypes: ["Jupyter"],
};

const clos = [
  {
    id: "clo-1",
    code: "CLO1",
    description: "Analyse data",
    level: "",
    mappedPlos: [],
    sltHours: "",
    teachingMethodIds: ["lab"],
    activeLearningStrategyIds: ["coding-exercise"],
    assessmentMethodIds: [],
    status: "active",
    notes: "",
  },
  {
    id: "clo-2",
    code: "CLO2",
    description: "Review work",
    level: "",
    mappedPlos: [],
    sltHours: "",
    teachingMethodIds: ["lecture"],
    activeLearningStrategyIds: ["peer-review"],
    assessmentMethodIds: [],
    status: "active",
    notes: "",
  },
] satisfies CloForm[];

const assessment = {
  id: "assessment-1",
  name: "Lab report",
  type: "Assignment",
  description: "",
  mode: "individual",
  status: "active",
  cloCodes: ["CLO1"],
  weight: "10",
  dueWeek: "3",
  durationWeeks: "",
  format: "",
  submissionMethod: "",
  instructions: "",
  rubric: "",
  feedbackMethod: "",
  feedbackTimeline: "",
  mappedPlos: [],
  notes: "",
} satisfies AssessmentForm;

test("weekly suggestions use only support mapped to the selected CLO", () => {
  const result = buildWeekSuggestions({
    week: "3",
    cloCodes: ["CLO1"],
    clos,
    teachingMethods,
    profile,
    assessments: [assessment],
  });

  expect(result.teachingMethods.map((method) => method.id)).toEqual(["lab"]);
  expect(result.activeLearningStrategies.map((strategy) => strategy.id)).toEqual([
    "coding-exercise",
  ]);
  expect(result.assessments.map((item) => item.id)).toEqual(["assessment-1"]);
});

test("weekly suggestions fall back to course strategies for legacy CLOs", () => {
  const legacyClos = clos.map((clo) => ({
    ...clo,
    activeLearningStrategyIds: [],
  }));
  const result = buildWeekSuggestions({
    week: "2",
    cloCodes: ["CLO1"],
    clos: legacyClos,
    teachingMethods,
    profile,
    assessments: [assessment],
  });

  expect(result.activeLearningStrategies.map((strategy) => strategy.id)).toEqual([
    "peer-review",
    "coding-exercise",
  ]);
  expect(result.assessments).toEqual([]);
});
