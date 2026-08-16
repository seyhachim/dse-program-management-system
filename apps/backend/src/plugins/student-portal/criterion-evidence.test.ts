import { describe, expect, test } from "bun:test";
import { calculateCloEvidence } from "./assessment-calculation.ts";

describe("criterion-level CLO evidence", () => {
  const assessments = [{ id: "a1", status: "Active", weight: 60, cloCodes: ["CLO1"] }];
  const results = [{ assessmentItemId: "a1", score: 80, maxScore: 100 }];

  test("criterion evidence replaces same-assessment fallback without using local grade weight", () => {
    const result = calculateCloEvidence("CLO1", assessments, results, [
      { assessmentItemId: "a1", rubricId: "r1", criterionId: "c1", criterionName: "Analysis", rubricContentHash: "h1", score: 2, maxScore: 4, cloCodes: ["CLO1"] },
      { assessmentItemId: "a1", rubricId: "r1", criterionId: "c2", criterionName: "Reasoning", rubricContentHash: "h1", score: 4, maxScore: 4, cloCodes: ["CLO1"] },
    ]);
    expect(result.percentage).toBe(75);
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence.every((evidence) => evidence.source === "criterion")).toBe(true);
    expect(result.evidence[0]).toMatchObject({ rubricId: "r1", criterionId: "c1", score: 2, maxScore: 4 });
  });

  test("falls back to existing assessment-level evidence when no criterion evidence exists", () => {
    const result = calculateCloEvidence("CLO1", assessments, results);
    expect(result.percentage).toBe(80);
    expect(result.evidence).toEqual([{ assessmentItemId: "a1", rawPercentage: 80, source: "assessment" }]);
  });
});
