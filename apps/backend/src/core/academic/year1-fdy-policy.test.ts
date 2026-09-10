import { describe, expect, test } from "bun:test";
import {
  FDY_2025_YEAR1_POLICY,
  Year1PolicyInputError,
  evaluateYear1AssessmentComposition,
  evaluateYear1Attendance,
  evaluateYear1Grade,
} from "./year1-fdy-policy.ts";

describe("FDY 2025 Year 1 grading", () => {
  test.each([
    [100, "A", 4],
    [85, "A", 4],
    [84.999, "B+", 3.5],
    [80, "B+", 3.5],
    [79.999, "B", 3],
    [70, "B", 3],
    [69.999, "C+", 2.5],
    [65, "C+", 2.5],
    [64.999, "C", 2],
    [50, "C", 2],
    [49.999, "D", 1.5],
    [45, "D", 1.5],
    [44.999, "E", 1],
    [40, "E", 1],
    [39.999, "F", 0],
    [0, "F", 0],
  ])("maps %p to %s / %p", (score, letterGrade, gradePoint) => {
    expect(evaluateYear1Grade({ programmeYear: 1, scorePercent: score })).toMatchObject({
      status: "COMPLIANT",
      policyCode: "FDY-2025",
      sourcePage: 2,
      letterGrade,
      gradePoint,
    });
  });

  test("never applies FDY 2025 to Years 2–4", () => {
    expect(evaluateYear1Grade({ programmeYear: 2, scorePercent: 90 })).toEqual({
      status: "NOT_APPLICABLE",
      policyCode: "FDY-2025",
    });
  });

  test("rejects invalid Year 1 percentages", () => {
    expect(() => evaluateYear1Grade({ programmeYear: 1, scorePercent: 100.1 })).toThrow(
      Year1PolicyInputError,
    );
  });
});

describe("FDY 2025 Year 1 assessment composition", () => {
  test("accepts the university 60/40 composition", () => {
    expect(
      evaluateYear1AssessmentComposition({
        programmeYear: 1,
        continuousWeightPercent: 60,
        semesterExamWeightPercent: 40,
      }),
    ).toMatchObject({ status: "COMPLIANT", violations: [] });
  });

  test("flags a non-60/40 Year 1 composition", () => {
    const result = evaluateYear1AssessmentComposition({
      programmeYear: 1,
      continuousWeightPercent: 50,
      semesterExamWeightPercent: 50,
    });
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.violations).toHaveLength(2);
  });

  test("does not constrain later programme years", () => {
    expect(
      evaluateYear1AssessmentComposition({
        programmeYear: 3,
        continuousWeightPercent: 50,
        semesterExamWeightPercent: 50,
      }).status,
    ).toBe("NOT_APPLICABLE");
  });
});

describe("FDY 2025 Year 1 attendance", () => {
  test("accepts scholarship thresholds exactly at their boundaries", () => {
    expect(
      evaluateYear1Attendance({
        programmeYear: 1,
        fundingCategory: "SCHOLARSHIP",
        attendancePercent: 80,
        excusedAbsencePercent: 20,
        unexcusedAbsencePercent: 15,
      }),
    ).toMatchObject({ status: "COMPLIANT", violations: [] });
  });

  test("flags every exceeded scholarship threshold", () => {
    const result = evaluateYear1Attendance({
      programmeYear: 1,
      fundingCategory: "SCHOLARSHIP",
      attendancePercent: 79.9,
      excusedAbsencePercent: 20.1,
      unexcusedAbsencePercent: 15.1,
    });
    expect(result.status).toBe("NON_COMPLIANT");
    expect(result.violations).toHaveLength(3);
  });

  test("accepts fee-paying thresholds exactly at their boundaries", () => {
    expect(
      evaluateYear1Attendance({
        programmeYear: 1,
        fundingCategory: "FEE_PAYING",
        attendancePercent: 70,
        excusedAbsencePercent: 30,
        unexcusedAbsencePercent: 20,
      }),
    ).toMatchObject({ status: "COMPLIANT", violations: [] });
  });

  test("requires review rather than guessing when funding category is missing", () => {
    expect(
      evaluateYear1Attendance({
        programmeYear: 1,
        fundingCategory: null,
        attendancePercent: 90,
        excusedAbsencePercent: 5,
        unexcusedAbsencePercent: 5,
      }),
    ).toMatchObject({
      status: "REVIEW_REQUIRED",
      policyCode: "FDY-2025",
      violations: [],
    });
  });

  test("does not apply Year 1 thresholds to later years", () => {
    expect(
      evaluateYear1Attendance({
        programmeYear: 4,
        fundingCategory: "SCHOLARSHIP",
        attendancePercent: 10,
        excusedAbsencePercent: 90,
        unexcusedAbsencePercent: 90,
      }).status,
    ).toBe("NOT_APPLICABLE");
  });
});

test("policy metadata remains explicitly university + Year 1 scoped", () => {
  expect(FDY_2025_YEAR1_POLICY.source.authority).toBe("University");
  expect(FDY_2025_YEAR1_POLICY.scope.programmeYear).toBe(1);
});
