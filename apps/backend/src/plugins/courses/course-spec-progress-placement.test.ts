import { describe, expect, test } from "bun:test";
import { uniqueActiveCurriculumPlacement } from "./course-spec-progress-placement.ts";

describe("Course Specification dashboard curriculum placement", () => {
  test("returns the only active placement", () => {
    const placement = { yearLevel: 2, semester: "Second" as const, sortOrder: 3 };
    expect(uniqueActiveCurriculumPlacement([placement])).toEqual(placement);
  });

  test("returns null when no active placement exists", () => {
    expect(uniqueActiveCurriculumPlacement([])).toBeNull();
  });

  test("fails visible rather than guessing across multiple active curriculum roots", () => {
    expect(uniqueActiveCurriculumPlacement([
      { yearLevel: 1, semester: "First" as const, sortOrder: 0 },
      { yearLevel: 3, semester: "Second" as const, sortOrder: 0 },
    ])).toBeNull();
  });
});
