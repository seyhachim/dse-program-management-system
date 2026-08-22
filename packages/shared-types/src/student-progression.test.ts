import { describe, expect, test } from "bun:test";
import {
  ApplyStudentPromotionInput,
  AppendStudentProgressionInput,
  CreateStudentCohortInput,
  ExitStudentCohortMembershipInput,
  PreviewStudentPromotionInput,
} from "./student-progression.ts";

describe("student progression contracts", () => {
  test("rejects expected graduation before intake", () => {
    expect(CreateStudentCohortInput.safeParse({ programmeId: "dse", code: "2026", name: "2026", intakeYear: 2026, expectedGraduationYear: 2025 }).success).toBe(false);
  });

  test("requires explicit programme year and accepts progression lifecycle states", () => {
    for (const status of ["Progressed", "Retained", "Withdrawn", "Inactive", "Graduated", "Transferred"]) {
      expect(AppendStudentProgressionInput.safeParse({
        membershipId: "00000000-0000-4000-8000-000000000001",
        programmeYear: 1,
        academicYear: "2026-2027",
        term: "Semester 1",
        periodStart: "2026-09-01",
        periodEnd: "2027-01-31",
        status,
      }).success).toBe(true);
    }
    expect(AppendStudentProgressionInput.safeParse({
      membershipId: "00000000-0000-4000-8000-000000000001",
      academicYear: "2026-2027",
      term: "Semester 1",
      periodStart: "2026-09-01",
      periodEnd: "2027-01-31",
      status: "Progressed",
    }).success).toBe(false);
  });

  test("requires dated exit reason and valid period ordering", () => {
    expect(ExitStudentCohortMembershipInput.safeParse({ exitedAt: "2027-01-01", exitReason: "Transferred" }).success).toBe(true);
    expect(AppendStudentProgressionInput.safeParse({
      membershipId: "00000000-0000-4000-8000-000000000001",
      programmeYear: 1,
      academicYear: "2026-2027",
      term: "Semester 1",
      periodStart: "2027-02-01",
      periodEnd: "2027-01-01",
      status: "Progressed",
    }).success).toBe(false);
  });

  test("promotion advances exactly one year and stops at Year 4", () => {
    expect(PreviewStudentPromotionInput.safeParse({
      sourceProgrammeYear: 1,
      targetProgrammeYear: 2,
      academicYear: "2026-2027",
      term: "Year end",
      periodStart: "2026-09-01",
      periodEnd: "2027-06-30",
    }).success).toBe(true);

    expect(PreviewStudentPromotionInput.safeParse({
      sourceProgrammeYear: 1,
      targetProgrammeYear: 3,
      academicYear: "2026-2027",
      term: "Year end",
      periodStart: "2026-09-01",
      periodEnd: "2027-06-30",
    }).success).toBe(false);

    expect(PreviewStudentPromotionInput.safeParse({
      sourceProgrammeYear: 4,
      targetProgrammeYear: 4,
      academicYear: "2029-2030",
      term: "Year end",
      periodStart: "2029-09-01",
      periodEnd: "2030-06-30",
    }).success).toBe(false);
  });

  test("apply rejects duplicate membership and graduation decisions", () => {
    const membershipId = "00000000-0000-4000-8000-000000000001";
    expect(ApplyStudentPromotionInput.safeParse({
      sourceProgrammeYear: 2,
      targetProgrammeYear: 3,
      academicYear: "2027-2028",
      term: "Year end",
      periodStart: "2027-09-01",
      periodEnd: "2028-06-30",
      decisions: [
        { membershipId, status: "Progressed" },
        { membershipId, status: "Retained" },
      ],
    }).success).toBe(false);

    expect(ApplyStudentPromotionInput.safeParse({
      sourceProgrammeYear: 3,
      targetProgrammeYear: 4,
      academicYear: "2028-2029",
      term: "Year end",
      periodStart: "2028-09-01",
      periodEnd: "2029-06-30",
      decisions: [{ membershipId, status: "Graduated" }],
    }).success).toBe(false);
  });
});
