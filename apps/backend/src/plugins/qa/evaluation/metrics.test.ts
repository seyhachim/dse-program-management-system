import { expect, test } from "bun:test";
import { calculateQaEvaluationMetrics } from "./metrics.ts";

test("QA evaluation metrics reproduce classification, referral, retrieval, and human-rating results", () => {
  const metrics = calculateQaEvaluationMetrics(
    [
      {
        goldState: "evidenceIdentified",
        predictedState: "evidenceIdentified",
        retrievedEvidence: [{ goldRelevant: true }, { goldRelevant: false }],
        goldRelevantEvidenceCount: 1,
      },
      {
        goldState: "potentialEvidenceGap",
        predictedState: "potentialEvidenceGap",
        retrievedEvidence: [{ goldRelevant: true }],
        goldRelevantEvidenceCount: 2,
      },
      {
        goldState: "expertReviewRequired",
        predictedState: "potentialEvidenceGap",
        retrievedEvidence: [{ goldRelevant: false }],
        goldRelevantEvidenceCount: 1,
      },
      {
        goldState: "evidenceIdentified",
        predictedState: "expertReviewRequired",
        retrievedEvidence: [],
        goldRelevantEvidenceCount: 1,
      },
      {
        goldState: null,
        predictedState: "evidenceIdentified",
        retrievedEvidence: [{ goldRelevant: true }],
        goldRelevantEvidenceCount: 1,
      },
    ],
    [
      {
        evidenceRelevance: 4,
        explanationClarity: 5,
        understandability: 4,
        usefulness: 3,
        traceability: 5,
      },
      {
        evidenceRelevance: 5,
        explanationClarity: 3,
        understandability: 4,
        usefulness: 5,
        traceability: 4,
      },
    ],
  );

  expect(metrics.labelledRuns).toBe(4);
  expect(metrics.accuracy).toBe(0.5);
  expect(metrics.expertReviewReferralRate).toBe(0.25);
  expect(metrics.falseGapPositiveCount).toBe(1);
  expect(metrics.evidenceRetrievalPrecision).toBe(0.5);
  expect(metrics.evidenceRetrievalRecall).toBe(0.4);
  expect(metrics.macroPrecision).toBe(0.5);
  expect(metrics.macroRecall).toBe(0.5);
  expect(metrics.macroF1).toBe(0.666667);

  const evidenceClass = metrics.classMetrics.find((item) => item.label === "evidenceIdentified");
  expect(evidenceClass).toEqual({
    label: "evidenceIdentified",
    truePositive: 1,
    falsePositive: 0,
    falseNegative: 1,
    precision: 1,
    recall: 0.5,
    f1: 0.666667,
  });

  expect(metrics.humanRatings).toEqual({
    count: 2,
    evidenceRelevance: 4.5,
    explanationClarity: 4,
    understandability: 4,
    usefulness: 4,
    traceability: 4.5,
  });
});

test("QA evaluation metrics return null rates when there is no human-labelled denominator", () => {
  const metrics = calculateQaEvaluationMetrics([], []);
  expect(metrics.labelledRuns).toBe(0);
  expect(metrics.accuracy).toBeNull();
  expect(metrics.expertReviewReferralRate).toBeNull();
  expect(metrics.evidenceRetrievalPrecision).toBeNull();
  expect(metrics.evidenceRetrievalRecall).toBeNull();
  expect(metrics.humanRatings.count).toBe(0);
});
