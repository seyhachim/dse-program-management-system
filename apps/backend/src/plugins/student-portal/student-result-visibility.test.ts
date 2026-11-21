import { describe, expect, test } from "bun:test";
import { isPublishedResultVisibleUnderSurveyGate } from "./student-result-visibility.ts";
import { studentVisibleCourse } from "./result-access-policy.ts";
import { studentPortalPluginService } from "./index.ts";

describe("student result visibility shared by portal and Telegram", () => {
  test("Telegram plugin service exposes the same gate-enforced view as the web route", () => {
    expect(studentPortalPluginService.course).toBe(studentVisibleCourse);
  });
  test("visible by default when the offering has no survey gate", () => {
    expect(isPublishedResultVisibleUnderSurveyGate(false, false, false)).toBe(true);
  });
  test("hides published provisional marks until required survey is submitted", () => {
    expect(isPublishedResultVisibleUnderSurveyGate(true, false, false)).toBe(false);
    expect(isPublishedResultVisibleUnderSurveyGate(true, true, false)).toBe(true);
  });
  test("finalized results are never hidden by the survey gate", () => {
    expect(isPublishedResultVisibleUnderSurveyGate(true, false, true)).toBe(true);
  });
});
