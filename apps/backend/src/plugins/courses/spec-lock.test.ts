import { describe, expect, test } from "bun:test";
import {
  CourseSpecLockedError,
  assertCourseSpecEditable,
} from "./spec-lock.ts";

describe("course specification write locking", () => {
  test("Draft and ChangesRequested remain editable", () => {
    expect(() => assertCourseSpecEditable("Draft")).not.toThrow();
    expect(() => assertCourseSpecEditable("ChangesRequested")).not.toThrow();
  });

  test.each(["Submitted", "UnderReview", "Resubmitted", "Approved"] as const)(
    "%s specifications are locked",
    (status) => {
      try {
        assertCourseSpecEditable(status);
        throw new Error("Expected specification to be locked");
      } catch (error) {
        expect(error).toBeInstanceOf(CourseSpecLockedError);
        expect((error as CourseSpecLockedError).reviewStatus).toBe(status);
        expect((error as CourseSpecLockedError).code).toBe(
          "COURSE_SPEC_LOCKED",
        );
      }
    },
  );
});
