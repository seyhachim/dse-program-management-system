import { describe, expect, test } from "bun:test";
import { courseSectionEmptyPresentation } from "./course-section-empty-state";

describe("Course Specifications section-empty wording", () => {
  test("shows No section yet only when the course has no sections globally", () => {
    expect(courseSectionEmptyPresentation(0, false)).toEqual({
      title: "No section yet",
      detail: "Course Spec preparation only",
      groupLabel: "Course Spec preparation",
    });
  });

  test("distinguishes existing sections that are not assigned to the lecturer", () => {
    expect(courseSectionEmptyPresentation(0, true)).toEqual({
      title: "No section assigned to you",
      detail: "Existing sections are assigned to other lecturers",
      groupLabel: "Responsible Course Specs",
    });
  });

  test("fails safe when section-presence metadata is unavailable", () => {
    const presentation = courseSectionEmptyPresentation(0, undefined);
    expect(presentation?.title).toBe("No section assigned to you");
    expect(presentation?.title).not.toBe("No section yet");
    expect(presentation?.detail).toBe("Section availability could not be confirmed");
  });

  test("returns no empty-state copy when the lecturer has an assigned section", () => {
    expect(courseSectionEmptyPresentation(1, true)).toBeNull();
    expect(courseSectionEmptyPresentation(2, false)).toBeNull();
  });
});
