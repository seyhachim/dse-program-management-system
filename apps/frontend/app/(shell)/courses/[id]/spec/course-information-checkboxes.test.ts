import { describe, expect, test } from "bun:test";
import {
  courseAvailabilityCheckboxText,
  courseTypeCheckboxText,
} from "./course-information-checkboxes";

describe("course information checkbox formatting", () => {
  test("marks exactly the selected course type", () => {
    expect(courseTypeCheckboxText("Core")).toBe(
      "Basic ☐   Core ☒   Elective ☐   Specialization ☐   MoEYS / HEIP ☐",
    );
    expect(courseTypeCheckboxText("MoEYS / HEIP")).toBe(
      "Basic ☐   Core ☐   Elective ☐   Specialization ☐   MoEYS / HEIP ☒",
    );
  });

  test("supports first and second semester labels", () => {
    expect(courseAvailabilityCheckboxText("First Semester")).toBe(
      "1st Semester ☒   2nd Semester ☐",
    );
    expect(courseAvailabilityCheckboxText("Second Semester")).toBe(
      "1st Semester ☐   2nd Semester ☒",
    );
  });

  test("leaves all boxes clear for unknown values", () => {
    expect(courseTypeCheckboxText("")).toBe(
      "Basic ☐   Core ☐   Elective ☐   Specialization ☐   MoEYS / HEIP ☐",
    );
    expect(courseAvailabilityCheckboxText("")).toBe(
      "1st Semester ☐   2nd Semester ☐",
    );
  });
});
