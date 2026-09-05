import { describe, expect, test } from "bun:test";
import { protectCourseInfoWrite } from "./course-info-write-boundary.ts";

describe("protectCourseInfoWrite", () => {
  test("allows a synopsis-only write and carries the authoritative prerequisite", () => {
    expect(
      protectCourseInfoWrite(
        { description: "Updated synopsis" },
        "Statistics II",
      ),
    ).toEqual({
      attemptedPrerequisiteWrite: false,
      values: {
        description: "Updated synopsis",
        prerequisites: "Statistics II",
      },
    });
  });

  test("reports a caller-supplied prerequisite write attempt", () => {
    expect(
      protectCourseInfoWrite(
        { description: "Updated", prerequisites: "Unapproved change" },
        "Authoritative prerequisite",
      ),
    ).toEqual({
      attemptedPrerequisiteWrite: true,
      values: {
        description: "Updated",
        prerequisites: "Authoritative prerequisite",
      },
    });
  });

  test("preserves an empty authoritative prerequisite without inventing one", () => {
    expect(protectCourseInfoWrite({ description: "Updated" }, null)).toEqual({
      attemptedPrerequisiteWrite: false,
      values: {
        description: "Updated",
        prerequisites: undefined,
      },
    });
  });
});
