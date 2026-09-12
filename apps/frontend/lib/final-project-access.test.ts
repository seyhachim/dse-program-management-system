import { describe, expect, test } from "bun:test";
import { requiresFinalProjectStudentEligibility } from "./final-project-access";

describe("Final Project frontend access policy", () => {
  test("student-only accounts require Year IV eligibility", () => {
    expect(requiresFinalProjectStudentEligibility(["student"])).toBe(true);
  });

  test("staff discovery roles do not depend on student eligibility", () => {
    expect(requiresFinalProjectStudentEligibility(["lecturer"])).toBe(false);
    expect(requiresFinalProjectStudentEligibility(["program_coordinator"])).toBe(false);
    expect(requiresFinalProjectStudentEligibility(["program_secretary"])).toBe(false);
    expect(requiresFinalProjectStudentEligibility(["admin"])).toBe(false);
  });

  test("multi-role staff plus student keep their staff entitlement", () => {
    expect(requiresFinalProjectStudentEligibility(["student", "lecturer"])).toBe(false);
    expect(requiresFinalProjectStudentEligibility(["student", "program_coordinator"])).toBe(false);
  });
});
