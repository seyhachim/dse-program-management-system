import { expect, test } from "bun:test";
import {
  CreateQaAnalysisReviewSchema,
  QaAnalysisCorrectionReasonCodeSchema,
  QaAnalysisReviewDecisionSchema,
  QaAnalysisReviewHistoryQuerySchema,
  qaAnalysisCorrectionReasonCategory,
} from "./index.ts";

test("human QA analysis review supports exactly three governance decisions", () => {
  expect(QaAnalysisReviewDecisionSchema.options).toEqual([
    "confirmed",
    "rejected",
    "needsMoreEvidence",
  ]);
});

test("confirmed review remains concise and cannot carry correction overrides", () => {
  expect(
    CreateQaAnalysisReviewSchema.safeParse({
      programmeId: "dse",
      decision: "confirmed",
      comment: "",
    }).success,
  ).toBe(true);
  expect(
    CreateQaAnalysisReviewSchema.safeParse({
      programmeId: "dse",
      decision: "confirmed",
      correctedState: "potentialEvidenceGap",
    }).success,
  ).toBe(false);
});

test("corrections require rationale and a structured disagreement reason", () => {
  expect(
    CreateQaAnalysisReviewSchema.safeParse({
      programmeId: "dse",
      decision: "rejected",
      comment: "short",
      reasonCode: "wrongScope",
    }).success,
  ).toBe(false);
  expect(
    CreateQaAnalysisReviewSchema.safeParse({
      programmeId: "dse",
      decision: "rejected",
      comment: "The evidence belongs to another CourseSpec version.",
    }).success,
  ).toBe(false);
  expect(
    CreateQaAnalysisReviewSchema.safeParse({
      programmeId: "dse",
      decision: "rejected",
      comment: "The evidence belongs to another CourseSpec version.",
      reasonCode: "wrongScope",
      correctedState: "expertReviewRequired",
      correctedEvidenceCandidateKeys: ["candidate:corrected:1"],
      correctedRelationships: [
        {
          fromCandidateKey: "candidate:a",
          toCandidateKey: "candidate:b",
          relation: "supports",
          state: "ambiguous",
        },
      ],
    }).success,
  ).toBe(true);
});

test("reason codes map to stable queryable categories", () => {
  expect(QaAnalysisCorrectionReasonCodeSchema.options).toContain("wrongScope");
  expect(qaAnalysisCorrectionReasonCategory("wrongScope")).toBe("scope");
  expect(qaAnalysisCorrectionReasonCategory("staleEvidence")).toBe("temporal");
  expect(qaAnalysisCorrectionReasonCategory("wrongRelationship")).toBe("relationship");
});

test("review history query remains programme-scoped", () => {
  expect(QaAnalysisReviewHistoryQuerySchema.safeParse({ programmeId: "dse" }).success).toBe(true);
  expect(QaAnalysisReviewHistoryQuerySchema.safeParse({}).success).toBe(false);
});
