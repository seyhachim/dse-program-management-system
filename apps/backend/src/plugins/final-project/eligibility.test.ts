import { describe, expect, test } from "bun:test";
import {
  resolveFinalProjectEligibility,
  type FinalProjectEnrollmentCandidate,
} from "./service.ts";

const base: FinalProjectEnrollmentCandidate = {
  programmeId: "dse",
  courseCode: "FPR401",
  programmeYear: 4,
  offeringStatus: "Planned",
  studentStatus: "Active",
};

describe("Final Project student eligibility", () => {
  test("accepts Planned FPR401 enrolment", () => {
    const result = resolveFinalProjectEligibility([base], "dse");
    expect(result).toEqual({ programmeId: "dse", eligible: true, courseCode: "FPR401" });
  });

  test("accepts active Semester II pathway enrolments", () => {
    for (const courseCode of ["FPR402", "THE402", "INT402"] as const) {
      const result = resolveFinalProjectEligibility([
        { ...base, courseCode, offeringStatus: "Active" },
      ], "dse");
      expect(result.eligible).toBe(true);
      expect(result.courseCode).toBe(courseCode);
    }
  });

  test("rejects completed, non-Year-4, inactive, and unrelated enrolments", () => {
    const candidates: FinalProjectEnrollmentCandidate[] = [
      { ...base, offeringStatus: "Completed" },
      { ...base, programmeYear: 3 },
      { ...base, studentStatus: "Inactive" },
      { ...base, courseCode: "TSA301" },
    ];
    expect(resolveFinalProjectEligibility(candidates, "dse").eligible).toBe(false);
  });

  test("does not allow an eligible enrolment from another programme", () => {
    const result = resolveFinalProjectEligibility([
      { ...base, programmeId: "bioeng" },
    ], "dse");
    expect(result).toEqual({ programmeId: "dse", eligible: false, courseCode: null });
  });
});
