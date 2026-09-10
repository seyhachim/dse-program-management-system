import { describe, expect, test } from "bun:test";
import { assertOfferingEnrollmentStudentsEligible, ReferenceError } from "./service.ts";

describe("interactive offering enrollment eligibility", () => {
  test("allows active students with an official ID", () => {
    expect(() =>
      assertOfferingEnrollmentStudentsEligible([{ studentId: "DSE-001", status: "Active" }]),
    ).not.toThrow();
  });

  test("blocks provisional or inactive students", () => {
    expect(() =>
      assertOfferingEnrollmentStudentsEligible([{ studentId: null, status: "Pending" }]),
    ).toThrow(ReferenceError);
    expect(() =>
      assertOfferingEnrollmentStudentsEligible([{ studentId: "DSE-002", status: "Inactive" }]),
    ).toThrow("Official Student ID and Active status are required");
  });
});
