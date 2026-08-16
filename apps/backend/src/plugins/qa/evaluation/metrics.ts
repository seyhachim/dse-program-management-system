import type {
  QaEvaluationMetricsView,
  QaEvidenceAnalysisState,
} from "@dse-pms/shared-types";

export interface QaEvaluationMetricRun {
  predictedState: QaEvidenceAnalysisState;
  goldState: QaEvidenceAnalysisState | null;
  retrievedEvidence: Array<{ goldRelevant: boolean | null }>;
  goldRelevantEvidenceCount: number;
}

export interface QaEvaluationMetricHumanRating {
  evidenceRelevance: number;
  explanationClarity: number;
  understandability: number;
  usefulness: number;
  traceability: number;
}

const labels: QaEvidenceAnalysisState[] = [
  "evidenceIdentified",
  "potentialEvidenceGap",
  "expertReviewRequired",
];

function safeDivide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function round(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(6));
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length === 0 ? null : valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function averageNumbers(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateQaEvaluationMetrics(
  runs: QaEvaluationMetricRun[],
  humanRatings: QaEvaluationMetricHumanRating[],
): QaEvaluationMetricsView {
  const labelled = runs.filter((run) => run.goldState !== null);
  const classMetrics = labels.map((label) => {
    const truePositive = labelled.filter(
      (run) => run.goldState === label && run.predictedState === label,
    ).length;
    const falsePositive = labelled.filter(
      (run) => run.goldState !== label && run.predictedState === label,
    ).length;
    const falseNegative = labelled.filter(
      (run) => run.goldState === label && run.predictedState !== label,
    ).length;
    const precision = safeDivide(truePositive, truePositive + falsePositive);
    const recall = safeDivide(truePositive, truePositive + falseNegative);
    const f1 =
      precision === null || recall === null || precision + recall === 0
        ? null
        : (2 * precision * recall) / (precision + recall);
    return {
      label,
      truePositive,
      falsePositive,
      falseNegative,
      precision: round(precision),
      recall: round(recall),
      f1: round(f1),
    };
  });

  const correct = labelled.filter((run) => run.predictedState === run.goldState).length;
  const expertReferrals = labelled.filter(
    (run) => run.predictedState === "expertReviewRequired",
  ).length;
  const falseGapPositiveCount = labelled.filter(
    (run) =>
      run.predictedState === "potentialEvidenceGap" &&
      run.goldState !== "potentialEvidenceGap",
  ).length;

  let retrievedJudged = 0;
  let retrievedRelevant = 0;
  let goldRelevantTotal = 0;
  for (const run of labelled) {
    goldRelevantTotal += run.goldRelevantEvidenceCount;
    for (const item of run.retrievedEvidence) {
      if (item.goldRelevant === null) continue;
      retrievedJudged += 1;
      if (item.goldRelevant) retrievedRelevant += 1;
    }
  }

  return {
    labelledRuns: labelled.length,
    accuracy: round(safeDivide(correct, labelled.length)),
    macroPrecision: round(average(classMetrics.map((item) => item.precision))),
    macroRecall: round(average(classMetrics.map((item) => item.recall))),
    macroF1: round(average(classMetrics.map((item) => item.f1))),
    expertReviewReferralRate: round(safeDivide(expertReferrals, labelled.length)),
    falseGapPositiveCount,
    evidenceRetrievalPrecision: round(safeDivide(retrievedRelevant, retrievedJudged)),
    evidenceRetrievalRecall: round(safeDivide(retrievedRelevant, goldRelevantTotal)),
    classMetrics,
    humanRatings: {
      count: humanRatings.length,
      evidenceRelevance: round(averageNumbers(humanRatings.map((item) => item.evidenceRelevance))),
      explanationClarity: round(averageNumbers(humanRatings.map((item) => item.explanationClarity))),
      understandability: round(averageNumbers(humanRatings.map((item) => item.understandability))),
      usefulness: round(averageNumbers(humanRatings.map((item) => item.usefulness))),
      traceability: round(averageNumbers(humanRatings.map((item) => item.traceability))),
    },
  };
}
