import { describe, expect, test } from "bun:test";
import {
  assertStudentPortalInviteEligible,
  ProvisioningError,
} from "./service.ts";

describe("Student Portal invitation eligibility", () => {
  test("requires an existing roster Student", () => {
    expect(() => assertStudentPortalInviteEligible(null)).toThrow(ProvisioningError);
    expect(() => assertStudentPortalInviteEligible(null)).toThrow(
      "Create the student roster profile with this email before sending a portal invite",
    );
  });

  test("requires the Student to be operationally Active", () => {
    expect(() =>
      assertStudentPortalInviteEligible({ status: "Pending", userId: null }),
    ).toThrow("Only Active students can receive Student Portal invitations");
    expect(() =>
      assertStudentPortalInviteEligible({ status: "Inactive", userId: null }),
    ).toThrow("Only Active students can receive Student Portal invitations");
  });

  test("blocks a duplicate first invite when a portal account is already linked", () => {
    expect(() =>
      assertStudentPortalInviteEligible({
        status: "Active",
        userId: "0d8f9caa-4b4f-4e77-a18f-933b574e9e5a",
      }),
    ).toThrow("This student already has a linked portal account");
  });

  test("allows an Active Student even while the official Student ID is pending", () => {
    expect(() =>
      assertStudentPortalInviteEligible({ status: "Active", userId: null }),
    ).not.toThrow();
  });
});
