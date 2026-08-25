import { describe, expect, test } from "bun:test";
import {
  isImportedAssessmentPlanComplete,
  shouldPersistImportedSection,
} from "./course-spec-import-section-status.ts";

describe("course-spec import section status", () => {
  test("marks an assessment plan complete when every imported item has a weight", () => {
    expect(
      isImportedAssessmentPlanComplete([{ weight: 20 }, { weight: 30 }, { weight: 50 }]),
    ).toBe(true);
  });

  test("keeps a partially unresolved assessment plan incomplete", () => {
    expect(
      isImportedAssessmentPlanComplete([{ weight: 20 }, { weight: null }, { weight: 80 }]),
    ).toBe(false);
  });

  test("keeps an all-null assessment plan incomplete", () => {
    expect(
      isImportedAssessmentPlanComplete([{ weight: null }, { weight: null }]),
    ).toBe(false);
  });

  test("treats an explicit zero percent as supplied rather than missing", () => {
    expect(
      isImportedAssessmentPlanComplete([{ weight: 0 }, { weight: 100 }]),
    ).toBe(true);
  });

  test("requires at least one assessment item before the plan is complete", () => {
    expect(isImportedAssessmentPlanComplete([])).toBe(false);
  });

  test("persists incomplete assessment and teaching-learning sections as Draft", () => {
    expect(shouldPersistImportedSection("assessmentPlan", false)).toBe(true);
    expect(shouldPersistImportedSection("teachingLearning", false)).toBe(true);
    expect(shouldPersistImportedSection("resources", false)).toBe(false);
  });
});
