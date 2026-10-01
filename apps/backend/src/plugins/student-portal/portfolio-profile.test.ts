import { describe, expect, test } from "bun:test";
import { PortalAccessError } from "./service.ts";
import { requirePortfolioStudent } from "./portfolio-profile.ts";

const activeStudent = {
  id: "student-record-1",
  name: "Student One",
  studentId: "DSE001",
  email: "student@example.edu",
  status: "Active",
  portfolioProfile: null,
};

describe("requirePortfolioStudent", () => {
  test("accepts an active email-backed student while the official Student ID is pending", () => {
    expect(() => requirePortfolioStudent({ ...activeStudent, studentId: null })).not.toThrow();
  });

  test("denies missing and inactive student identities", () => {
    expect(() => requirePortfolioStudent(null)).toThrow(PortalAccessError);
    expect(() => requirePortfolioStudent({ ...activeStudent, status: "Inactive" })).toThrow(PortalAccessError);
  });

  test("denies a roster-only student without an official portal email", () => {
    expect(() => requirePortfolioStudent({ ...activeStudent, email: null })).toThrow(PortalAccessError);
  });
});
