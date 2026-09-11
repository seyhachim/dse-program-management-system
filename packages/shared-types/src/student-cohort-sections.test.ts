import { describe, expect, test } from "bun:test";
import {
  AddStudentCohortSectionMembershipInput,
  CreateStudentCohortSectionInput,
  ExitStudentCohortSectionMembershipInput,
  UpdateStudentCohortSectionInput,
} from "./student-cohort-sections.ts";

describe("student cohort section contracts", () => {
  test("normalizes section codes to uppercase", () => {
    const parsed = CreateStudentCohortSectionInput.parse({
      cohortId: "11111111-1111-4111-8111-111111111111",
      code: "m1",
      name: "Morning 1",
    });
    expect(parsed.code).toBe("M1");
  });

  test("requires a real update field", () => {
    expect(UpdateStudentCohortSectionInput.safeParse({}).success).toBe(false);
    expect(UpdateStudentCohortSectionInput.safeParse({ active: false }).success).toBe(true);
  });

  test("requires dated membership input", () => {
    expect(AddStudentCohortSectionMembershipInput.safeParse({
      studentId: "22222222-2222-4222-8222-222222222222",
      joinedAt: "2026-09-11",
    }).success).toBe(true);
    expect(AddStudentCohortSectionMembershipInput.safeParse({
      studentId: "22222222-2222-4222-8222-222222222222",
      joinedAt: "11/09/2026",
    }).success).toBe(false);
    expect(ExitStudentCohortSectionMembershipInput.safeParse({ exitedAt: "2026-09-11" }).success).toBe(true);
  });
});
