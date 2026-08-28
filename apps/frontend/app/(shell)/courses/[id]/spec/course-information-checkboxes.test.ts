import { describe, expect, test } from "bun:test";
import {
  courseAvailabilityCheckboxText,
  courseTypeCheckboxText,
} from "./course-information-checkboxes";

const GAP = "\u2003\u2003";

describe("course information checkbox formatting", () => {
  test("marks exactly the selected course type with a tick", () => {
    expect(courseTypeCheckboxText("Core")).toBe(
      `Basic ☐${GAP}Core ☑${GAP}Elective ☐${GAP}Specialization ☐${GAP}MoEYS / HEIP ☐`,
    );
    expect(courseTypeCheckboxText("MoEYS / HEIP")).toBe(
      `Basic ☐${GAP}Core ☐${GAP}Elective ☐${GAP}Specialization ☐${GAP}MoEYS / HEIP ☑`,
    );
  });

  test("supports first and second semester labels with ticked boxes", () => {
    expect(courseAvailabilityCheckboxText("First Semester")).toBe(
      `1st Semester ☑${GAP}2nd Semester ☐`,
    );
    expect(courseAvailabilityCheckboxText("Second Semester")).toBe(
      `1st Semester ☐${GAP}2nd Semester ☑`,
    );
  });

  test("leaves all boxes clear for unknown values", () => {
    expect(courseTypeCheckboxText("")).toBe(
      `Basic ☐${GAP}Core ☐${GAP}Elective ☐${GAP}Specialization ☐${GAP}MoEYS / HEIP ☐`,
    );
    expect(courseAvailabilityCheckboxText("")).toBe(
      `1st Semester ☐${GAP}2nd Semester ☐`,
    );
  });
});
