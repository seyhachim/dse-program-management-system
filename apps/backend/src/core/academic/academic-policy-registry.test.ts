import { describe, expect, test } from "bun:test";
import {
  academicPoliciesForProgrammeYear,
  academicPolicyByCode,
} from "./academic-policy-registry.ts";

describe("academic policy registry", () => {
  test("registers FDY 2025 as a university Year 1 policy", () => {
    expect(academicPolicyByCode("FDY-2025")).toMatchObject({
      code: "FDY-2025",
      version: "2025",
      scope: { programmeYear: 1 },
      source: { authority: "University" },
    });
  });

  test("returns FDY 2025 for Year 1 only", () => {
    expect(academicPoliciesForProgrammeYear(1).map((policy) => policy.code)).toEqual([
      "FDY-2025",
    ]);
    expect(academicPoliciesForProgrammeYear(2)).toEqual([]);
    expect(academicPoliciesForProgrammeYear(3)).toEqual([]);
    expect(academicPoliciesForProgrammeYear(4)).toEqual([]);
  });
});
