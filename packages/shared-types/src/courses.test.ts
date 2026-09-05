import { describe, expect, test } from "bun:test";
import {
  isFinalProjectCourseCode,
  SetCourseSpecResponsibleLecturersInputSchema,
} from "./courses.ts";

describe("Final Project course classification", () => {
  test("recognizes FPR401 and FPR402 without depending on title casing", () => {
    expect(isFinalProjectCourseCode("FPR401")).toBe(true);
    expect(isFinalProjectCourseCode(" fpr402 ")).toBe(true);
  });

  test("does not classify ordinary or unknown courses as Final Project", () => {
    expect(isFinalProjectCourseCode("DSS302")).toBe(false);
    expect(isFinalProjectCourseCode("FPR403")).toBe(false);
  });
});

describe("Course Spec responsible lecturers contract", () => {
  test("accepts multiple unique responsible lecturers", () => {
    const result = SetCourseSpecResponsibleLecturersInputSchema.safeParse({
      lecturerIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects duplicate responsible lecturers", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const result = SetCourseSpecResponsibleLecturersInputSchema.safeParse({
      lecturerIds: [id, id],
    });
    expect(result.success).toBe(false);
  });
});
