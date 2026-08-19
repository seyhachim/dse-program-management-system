import { describe, expect, test } from "bun:test";
import { SetCourseSpecResponsibleLecturersInputSchema } from "./courses.ts";

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
