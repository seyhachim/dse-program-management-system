import { describe, expect, test } from "bun:test";
import {
  assertSchedulePortalStudent,
  StudentScheduleImpactAccessError,
} from "./schedule-impact-service.ts";

describe("Student Portal schedule provisional identity", () => {
  test("allows an Active linked student with institutional email while official Student ID is pending", () => {
    expect(() =>
      assertSchedulePortalStudent({
        status: "Active",
        email: "student@example.edu",
      }),
    ).not.toThrow();
  });

  test("fails closed for inactive or no-email profiles", () => {
    expect(() =>
      assertSchedulePortalStudent({
        status: "Inactive",
        email: "student@example.edu",
      }),
    ).toThrow(StudentScheduleImpactAccessError);

    expect(() =>
      assertSchedulePortalStudent({
        status: "Active",
        email: null,
      }),
    ).toThrow(StudentScheduleImpactAccessError);

    expect(() => assertSchedulePortalStudent(null)).toThrow(
      StudentScheduleImpactAccessError,
    );
  });
});
