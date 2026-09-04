import { describe, expect, test } from "bun:test";
import { protectCourseInfoWrite } from "./course-info-write-boundary.ts";

describe("Course Information write boundary", () => {
  test("passes synopsis while carrying authoritative prerequisites internally", () => {
    expect(
      protectCourseInfoWrite(
        { description: "Current course synopsis" },
        "Statistics I",
      ),
    ).toEqual({
      attemptedPrerequisiteWrite: false,
      values: {
        description: "Current course synopsis",
        prerequisites: "Statistics I",
      },
    });
  });

  test("flags caller attempts to change prerequisites", () => {
    const protectedWrite = protectCourseInfoWrite(
      {
        description: "Updated synopsis",
        prerequisites: "Bypass prerequisite",
      },
      "Authoritative prerequisite",
    );

    expect(protectedWrite.attemptedPrerequisiteWrite).toBe(true);
    expect(protectedWrite.values.prerequisites).toBe(
      "Authoritative prerequisite",
    );
  });

  test("preserves an empty authoritative prerequisite without inventing data", () => {
    expect(protectCourseInfoWrite({ description: "Synopsis" }, null)).toEqual({
      attemptedPrerequisiteWrite: false,
      values: { description: "Synopsis", prerequisites: undefined },
    });
  });
});
