import type { StudentFundingCategory } from "@dse-pms/shared-types";

const EPSILON = 1e-9;

export const FDY_2025_YEAR1_POLICY = {
  code: "FDY-2025",
  version: "2025",
  title: "University Policy — Year 1 (FDY 2025)",
  scope: {
    programmeYear: 1,
  },
  source: {
    fileName: "បទបញ្ញត្តិ FDY 2025.pdf",
    authority: "University",
    sourceRef: "RUPP university policy — Year 1 / Foundation Year (FDY 2025)",
  },
  grading: {
    sourcePage: 2,
    bands: [
      { minScore: 85, maxScore: 100, maxInclusive: true, letterGrade: "A", gradePoint: 4 },
      { minScore: 80, maxScore: 85, maxInclusive: false, letterGrade: "B+", gradePoint: 3.5 },
      { minScore: 70, maxScore: 80, maxInclusive: false, letterGrade: "B", gradePoint: 3 },
      { minScore: 65, maxScore: 70, maxInclusive: false, letterGrade: "C+", gradePoint: 2.5 },
      { minScore: 50, maxScore: 65, maxInclusive: false, letterGrade: "C", gradePoint: 2 },
      { minScore: 45, maxScore: 50, maxInclusive: false, letterGrade: "D", gradePoint: 1.5 },
      { minScore: 40, maxScore: 45, maxInclusive: false, letterGrade: "E", gradePoint: 1 },
      { minScore: 0, maxScore: 40, maxInclusive: false, letterGrade: "F", gradePoint: 0 },
    ],
  },
  assessment: {
    sourcePage: 1,
    continuousWeightPercent: 60,
    semesterExamWeightPercent: 40,
  },
  attendance: {
    sourcePage: 1,
    scholarship: {
      minimumAttendancePercent: 80,
      maximumExcusedAbsencePercent: 20,
      maximumUnexcusedAbsencePercent: 15,
    },
    feePaying: {
      minimumAttendancePercent: 70,
      maximumExcusedAbsencePercent: 30,
      maximumUnexcusedAbsencePercent: 20,
    },
  },
} as const;

/** Backwards-compatible alias; Student is the canonical funding-category domain. */
export type Year1FundingCategory = StudentFundingCategory;
export type Year1PolicyStatus =
  | "NOT_APPLICABLE"
  | "COMPLIANT"
  | "NON_COMPLIANT"
  | "REVIEW_REQUIRED";

export class Year1PolicyInputError extends Error {}

function assertPercentage(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Year1PolicyInputError(`${name} must be between 0 and 100`);
  }
}

function isYear1(programmeYear: number | null | undefined): boolean {
  return programmeYear === FDY_2025_YEAR1_POLICY.scope.programmeYear;
}

export function evaluateYear1Grade(input: {
  programmeYear: number | null | undefined;
  scorePercent: number;
}) {
  if (!isYear1(input.programmeYear)) {
    return {
      status: "NOT_APPLICABLE" as const,
      policyCode: FDY_2025_YEAR1_POLICY.code,
    };
  }

  assertPercentage("scorePercent", input.scorePercent);

  const band = FDY_2025_YEAR1_POLICY.grading.bands.find((candidate) => {
    const aboveMinimum = input.scorePercent + EPSILON >= candidate.minScore;
    const belowMaximum = candidate.maxInclusive
      ? input.scorePercent <= candidate.maxScore + EPSILON
      : input.scorePercent < candidate.maxScore - EPSILON;
    return aboveMinimum && belowMaximum;
  });

  if (!band) {
    throw new Year1PolicyInputError("scorePercent does not match an FDY 2025 grade band");
  }

  return {
    status: "COMPLIANT" as const,
    policyCode: FDY_2025_YEAR1_POLICY.code,
    sourcePage: FDY_2025_YEAR1_POLICY.grading.sourcePage,
    letterGrade: band.letterGrade,
    gradePoint: band.gradePoint,
  };
}

export function evaluateYear1AssessmentComposition(input: {
  programmeYear: number | null | undefined;
  continuousWeightPercent: number;
  semesterExamWeightPercent: number;
}) {
  if (!isYear1(input.programmeYear)) {
    return {
      status: "NOT_APPLICABLE" as const,
      policyCode: FDY_2025_YEAR1_POLICY.code,
      violations: [] as string[],
    };
  }

  assertPercentage("continuousWeightPercent", input.continuousWeightPercent);
  assertPercentage("semesterExamWeightPercent", input.semesterExamWeightPercent);

  const expected = FDY_2025_YEAR1_POLICY.assessment;
  const violations: string[] = [];

  if (Math.abs(input.continuousWeightPercent - expected.continuousWeightPercent) > EPSILON) {
    violations.push(
      `Continuous/in-class assessment must be ${expected.continuousWeightPercent}%`,
    );
  }
  if (Math.abs(input.semesterExamWeightPercent - expected.semesterExamWeightPercent) > EPSILON) {
    violations.push(`Semester examination must be ${expected.semesterExamWeightPercent}%`);
  }

  return {
    status: (violations.length === 0 ? "COMPLIANT" : "NON_COMPLIANT") as
      | "COMPLIANT"
      | "NON_COMPLIANT",
    policyCode: FDY_2025_YEAR1_POLICY.code,
    sourcePage: expected.sourcePage,
    violations,
  };
}

export function evaluateYear1Attendance(input: {
  programmeYear: number | null | undefined;
  fundingCategory: Year1FundingCategory | null | undefined;
  attendancePercent: number;
  excusedAbsencePercent: number;
  unexcusedAbsencePercent: number;
}) {
  if (!isYear1(input.programmeYear)) {
    return {
      status: "NOT_APPLICABLE" as const,
      policyCode: FDY_2025_YEAR1_POLICY.code,
      violations: [] as string[],
    };
  }

  assertPercentage("attendancePercent", input.attendancePercent);
  assertPercentage("excusedAbsencePercent", input.excusedAbsencePercent);
  assertPercentage("unexcusedAbsencePercent", input.unexcusedAbsencePercent);

  if (!input.fundingCategory) {
    return {
      status: "REVIEW_REQUIRED" as const,
      policyCode: FDY_2025_YEAR1_POLICY.code,
      sourcePage: FDY_2025_YEAR1_POLICY.attendance.sourcePage,
      reason: "Year 1 funding category is required to select the applicable attendance thresholds",
      violations: [] as string[],
    };
  }

  const thresholds =
    input.fundingCategory === "SCHOLARSHIP"
      ? FDY_2025_YEAR1_POLICY.attendance.scholarship
      : FDY_2025_YEAR1_POLICY.attendance.feePaying;
  const violations: string[] = [];

  if (input.attendancePercent + EPSILON < thresholds.minimumAttendancePercent) {
    violations.push(`Attendance must be at least ${thresholds.minimumAttendancePercent}%`);
  }
  if (input.excusedAbsencePercent - EPSILON > thresholds.maximumExcusedAbsencePercent) {
    violations.push(
      `Excused absence must not exceed ${thresholds.maximumExcusedAbsencePercent}%`,
    );
  }
  if (input.unexcusedAbsencePercent - EPSILON > thresholds.maximumUnexcusedAbsencePercent) {
    violations.push(
      `Unexcused absence must not exceed ${thresholds.maximumUnexcusedAbsencePercent}%`,
    );
  }

  return {
    status: (violations.length === 0 ? "COMPLIANT" : "NON_COMPLIANT") as
      | "COMPLIANT"
      | "NON_COMPLIANT",
    policyCode: FDY_2025_YEAR1_POLICY.code,
    sourcePage: FDY_2025_YEAR1_POLICY.attendance.sourcePage,
    fundingCategory: input.fundingCategory,
    thresholds,
    violations,
  };
}
