import { describe, expect, test } from "bun:test";
import {
  canToggleStudentActive,
  studentPortalProvisioningBlocker,
} from "./student-portal-eligibility";

const readyStudent = {
  studentId: "DSE-2025-001",
  email: "student@rupp.edu.kh",
  status: "Active" as const,
};

describe("student portal provisioning eligibility", () => {
  test("blocks when no student is selected", () => {
    expect(studentPortalProvisioningBlocker(null)).toContain("Select one Active student");
  });

  test("blocks provisional students before status/email checks", () => {
    expect(studentPortalProvisioningBlocker({
      ...readyStudent,
      studentId: null,
      status: "Pending",
    })).toBe("Add an official Student ID before provisioning portal access.");
    expect(canToggleStudentActive({ studentId: null })).toBe(false);
  });

  test("blocks non-active students", () => {
    expect(studentPortalProvisioningBlocker({
      ...readyStudent,
      status: "Pending",
    })).toBe("Activate this student before provisioning portal access.");
  });

  test("blocks students without institutional email", () => {
    expect(studentPortalProvisioningBlocker({
      ...readyStudent,
      email: null,
    })).toBe("Add an institutional email before provisioning portal access.");
  });

  test("allows an active student with official ID and institutional email", () => {
    expect(studentPortalProvisioningBlocker(readyStudent)).toBeNull();
    expect(canToggleStudentActive(readyStudent)).toBe(true);
  });
});
