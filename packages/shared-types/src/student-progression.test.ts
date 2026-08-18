import { describe, expect, test } from "bun:test";
import { AppendStudentProgressionInput, CreateStudentCohortInput, ExitStudentCohortMembershipInput } from "./student-progression.ts";

describe("student progression contracts", () => {
  test("rejects expected graduation before intake", () => {
    expect(CreateStudentCohortInput.safeParse({ programmeId: "dse", code: "2026", name: "2026", intakeYear: 2026, expectedGraduationYear: 2025 }).success).toBe(false);
  });
  test("accepts explicit progression lifecycle states", () => {
    for (const status of ["Progressed", "Retained", "Withdrawn", "Inactive", "Graduated", "Transferred"]) {
      expect(AppendStudentProgressionInput.safeParse({ membershipId: "00000000-0000-4000-8000-000000000001", academicYear: "2026-2027", term: "Semester 1", periodStart: "2026-09-01", periodEnd: "2027-01-31", status }).success).toBe(true);
    }
  });
  test("requires dated exit reason and valid period ordering", () => {
    expect(ExitStudentCohortMembershipInput.safeParse({ exitedAt: "2027-01-01", exitReason: "Transferred" }).success).toBe(true);
    expect(AppendStudentProgressionInput.safeParse({ membershipId: "00000000-0000-4000-8000-000000000001", academicYear: "2026-2027", term: "Semester 1", periodStart: "2027-02-01", periodEnd: "2027-01-01", status: "Progressed" }).success).toBe(false);
  });
});
