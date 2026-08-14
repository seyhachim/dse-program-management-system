import { expect, test } from "bun:test";
import {
  CreateQaAnalysisReviewSchema,
  QaAnalysisReviewDecisionSchema,
  QaAnalysisReviewHistoryQuerySchema,
} from "./index.ts";

test("human QA analysis review supports exactly three governance decisions", () => {
  expect(QaAnalysisReviewDecisionSchema.options).toEqual([
    "confirmed",
    "rejected",
    "needsMoreEvidence",
  ]);
});

test("confirmed review may be concise while rejection and more-evidence decisions require explanation", () => {
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
      decision: "rejected",
      comment: "short",
    }).success,
  ).toBe(false);
  expect(
    CreateQaAnalysisReviewSchema.safeParse({
      programmeId: "dse",
      decision: "needsMoreEvidence",
      comment: "Please attach the signed review minutes.",
    }).success,
  ).toBe(true);
});

test("review history query remains programme-scoped", () => {
  expect(QaAnalysisReviewHistoryQuerySchema.safeParse({ programmeId: "dse" }).success).toBe(true);
  expect(QaAnalysisReviewHistoryQuerySchema.safeParse({}).success).toBe(false);
});
