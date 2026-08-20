import { describe, expect, test } from "bun:test";
import {
  CreateProgrammeGradingScaleSchema,
  UpdateProgrammeGradingScaleDraftSchema,
} from "@dse-pms/shared-types";

const grades = [
  { sortOrder: 1, letterGrade: "A", gradePoint: 4, minScore: 85, maxScore: 100, minInclusive: true, maxInclusive: true, explanation: "Excellent", isPassing: true },
  { sortOrder: 2, letterGrade: "B+", gradePoint: 3.5, minScore: 80, maxScore: 85, minInclusive: true, maxInclusive: false, explanation: "Very Good", isPassing: true },
  { sortOrder: 3, letterGrade: "B", gradePoint: 3, minScore: 75, maxScore: 80, minInclusive: true, maxInclusive: false, explanation: "Good", isPassing: true },
  { sortOrder: 4, letterGrade: "C+", gradePoint: 2.5, minScore: 70, maxScore: 75, minInclusive: true, maxInclusive: false, explanation: "Fairly Good", isPassing: true },
  { sortOrder: 5, letterGrade: "C", gradePoint: 2, minScore: 65, maxScore: 70, minInclusive: true, maxInclusive: false, explanation: "Fair", isPassing: true },
  { sortOrder: 6, letterGrade: "D+", gradePoint: 1.5, minScore: 60, maxScore: 65, minInclusive: true, maxInclusive: false, explanation: "Poor", isPassing: true },
  { sortOrder: 7, letterGrade: "D", gradePoint: 1, minScore: 50, maxScore: 60, minInclusive: true, maxInclusive: false, explanation: "Very Poor", isPassing: true },
  { sortOrder: 8, letterGrade: "F", gradePoint: 0, minScore: 0, maxScore: 50, minInclusive: true, maxInclusive: false, explanation: "Fail", isPassing: false },
];

describe("programme grading-scale API contracts", () => {
  test("accepts the migrated DSE baseline as a create payload", () => {
    const parsed = CreateProgrammeGradingScaleSchema.safeParse({
      programmeId: "dse",
      code: "standard",
      name: "DSE Standard Grading Scale",
      description: "Programme-wide policy",
      grades,
    });
    expect(parsed.success).toBe(true);
  });

  test("draft update requires at least one changed field", () => {
    expect(UpdateProgrammeGradingScaleDraftSchema.safeParse({}).success).toBe(false);
    expect(
      UpdateProgrammeGradingScaleDraftSchema.safeParse({
        changeSummary: "Update thresholds for the next academic policy version",
      }).success,
    ).toBe(true);
  });
});
