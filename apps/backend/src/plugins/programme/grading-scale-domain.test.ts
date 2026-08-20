import { describe, expect, test } from "bun:test";
import type { DraftGradingScaleGradeInput } from "@dse-pms/shared-types";
import {
  GradingScaleValidationError,
  gradingScaleScoreLabel,
  validateGradingScaleBands,
} from "./grading-scale-domain.ts";

const baseline: DraftGradingScaleGradeInput[] = [
  {
    sortOrder: 1,
    letterGrade: "A",
    gradePoint: 4,
    minScore: 85,
    maxScore: 100,
    minInclusive: true,
    maxInclusive: true,
    explanation: "Excellent",
    isPassing: true,
  },
  {
    sortOrder: 2,
    letterGrade: "B+",
    gradePoint: 3.5,
    minScore: 80,
    maxScore: 85,
    minInclusive: true,
    maxInclusive: false,
    explanation: "Very Good",
    isPassing: true,
  },
  {
    sortOrder: 3,
    letterGrade: "B",
    gradePoint: 3,
    minScore: 75,
    maxScore: 80,
    minInclusive: true,
    maxInclusive: false,
    explanation: "Good",
    isPassing: true,
  },
  {
    sortOrder: 4,
    letterGrade: "C+",
    gradePoint: 2.5,
    minScore: 70,
    maxScore: 75,
    minInclusive: true,
    maxInclusive: false,
    explanation: "Fairly Good",
    isPassing: true,
  },
  {
    sortOrder: 5,
    letterGrade: "C",
    gradePoint: 2,
    minScore: 65,
    maxScore: 70,
    minInclusive: true,
    maxInclusive: false,
    explanation: "Fair",
    isPassing: true,
  },
  {
    sortOrder: 6,
    letterGrade: "D+",
    gradePoint: 1.5,
    minScore: 60,
    maxScore: 65,
    minInclusive: true,
    maxInclusive: false,
    explanation: "Poor",
    isPassing: true,
  },
  {
    sortOrder: 7,
    letterGrade: "D",
    gradePoint: 1,
    minScore: 50,
    maxScore: 60,
    minInclusive: true,
    maxInclusive: false,
    explanation: "Very Poor",
    isPassing: true,
  },
  {
    sortOrder: 8,
    letterGrade: "F",
    gradePoint: 0,
    minScore: 0,
    maxScore: 50,
    minInclusive: true,
    maxInclusive: false,
    explanation: "Fail",
    isPassing: false,
  },
];

describe("validateGradingScaleBands", () => {
  test("accepts the current DSE 0-100 grading scale", () => {
    expect(() => validateGradingScaleBands(baseline)).not.toThrow();
  });

  test("rejects a gap", () => {
    const grades = baseline.map((grade) => ({ ...grade }));
    grades[6]!.minScore = 51;
    expect(() => validateGradingScaleBands(grades)).toThrow(
      GradingScaleValidationError,
    );
  });

  test("rejects an overlapping inclusive intermediate upper bound", () => {
    const grades = baseline.map((grade) => ({ ...grade }));
    grades[7]!.maxInclusive = true;
    expect(() => validateGradingScaleBands(grades)).toThrow(
      GradingScaleValidationError,
    );
  });

  test("rejects duplicate grade labels", () => {
    const grades = baseline.map((grade) => ({ ...grade }));
    grades[1]!.letterGrade = "A";
    expect(() => validateGradingScaleBands(grades)).toThrow(
      GradingScaleValidationError,
    );
  });
});

describe("gradingScaleScoreLabel", () => {
  test("preserves the published DSE score-band wording", () => {
    expect(gradingScaleScoreLabel(baseline[0]!)).toBe("85–100");
    expect(gradingScaleScoreLabel(baseline[1]!)).toBe("80–84");
    expect(gradingScaleScoreLabel(baseline[6]!)).toBe("50–59");
    expect(gradingScaleScoreLabel(baseline[7]!)).toBe("<50");
  });
});
