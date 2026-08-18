import type {
  QaEvidenceAnalysisState,
  QaResearchMetricSummary,
} from "@dse-pms/shared-types";

export interface ResearchMetricEvidence {
  scenarioEvidenceId: string;
  relevance: number | null;
  goldRelevant: boolean | null;
  citationCorrect: boolean | null;
  scopeMatch: boolean | null;
  temporalMatch: boolean | null;
}

export interface ResearchMetricRun {
  predictedState: QaEvidenceAnalysisState;
  goldState: QaEvidenceAnalysisState;
  retrievedEvidence: ResearchMetricEvidence[];
  goldRelevantEvidenceCount: number;
}

export interface ResearchMetricHumanRating {
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

function divide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function round(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(6));
}

function average(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageNullable(values: Array<number | null>): number | null {
  return average(values.filter((value): value is number => value !== null));
}

function booleanRate(values: Array<boolean | null>): number | null {
  const judged = values.filter((value): value is boolean => value !== null);
  if (judged.length === 0) return null;
  return round(judged.filter(Boolean).length / judged.length);
}

function sortedEvidence(items: ResearchMetricEvidence[]): ResearchMetricEvidence[] {
  return [...items].sort((left, right) => {
    if (left.relevance === null && right.relevance !== null) return 1;
    if (left.relevance !== null && right.relevance === null) return -1;
    if (left.relevance !== null && right.relevance !== null && left.relevance !== right.relevance) {
      return right.relevance - left.relevance;
    }
    return left.scenarioEvidenceId.localeCompare(right.scenarioEvidenceId);
  });
}

export function calculateQaResearchMetrics(
  runs: ResearchMetricRun[],
  humanRatings: ResearchMetricHumanRating[],
  k: number,
): QaResearchMetricSummary {
  const classMetrics = labels.map((label) => {
    const truePositive = runs.filter(
      (run) => run.goldState === label && run.predictedState === label,
    ).length;
    const falsePositive = runs.filter(
      (run) => run.goldState !== label && run.predictedState === label,
    ).length;
    const falseNegative = runs.filter(
      (run) => run.goldState === label && run.predictedState !== label,
    ).length;
    const precision = divide(truePositive, truePositive + falsePositive);
    const recall = divide(truePositive, truePositive + falseNegative);
    const f1 = precision === null || recall === null || precision + recall === 0
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

  const confusionMatrix = labels.flatMap((gold) =>
    labels.map((predicted) => ({
      gold,
      predicted,
      count: runs.filter(
        (run) => run.goldState === gold && run.predictedState === predicted,
      ).length,
    })),
  );

  const correct = runs.filter((run) => run.predictedState === run.goldState).length;
  const predictedGaps = runs.filter((run) => run.predictedState === "potentialEvidenceGap");
  const falseGapPositiveCount = predictedGaps.filter(
    (run) => run.goldState !== "potentialEvidenceGap",
  ).length;
  const goldNonGaps = runs.filter((run) => run.goldState !== "potentialEvidenceGap").length;

  const nonAbstained = runs.filter((run) => run.predictedState !== "expertReviewRequired");
  const nonAbstainedCorrect = nonAbstained.filter(
    (run) => run.predictedState === run.goldState,
  ).length;
  const disagreements = nonAbstained.length - nonAbstainedCorrect;

  const retrievalRuns = runs.filter((run) => run.goldRelevantEvidenceCount > 0);
  const precisionAtK: number[] = [];
  const recallAtK: number[] = [];
  const reciprocalRanks: number[] = [];
  const citations: Array<boolean | null> = [];
  const scopes: Array<boolean | null> = [];
  const temporals: Array<boolean | null> = [];

  for (const run of retrievalRuns) {
    const ranked = sortedEvidence(run.retrievedEvidence);
    const topK = ranked.slice(0, k);
    const relevantAtK = topK.filter((item) => item.goldRelevant === true).length;
    precisionAtK.push(relevantAtK / k);
    recallAtK.push(relevantAtK / run.goldRelevantEvidenceCount);
    const firstRelevant = ranked.findIndex((item) => item.goldRelevant === true);
    reciprocalRanks.push(firstRelevant === -1 ? 0 : 1 / (firstRelevant + 1));
    for (const item of ranked) {
      citations.push(item.citationCorrect);
      scopes.push(item.scopeMatch);
      temporals.push(item.temporalMatch);
    }
  }

  return {
    labelledRuns: runs.length,
    classification: {
      accuracy: round(divide(correct, runs.length)),
      macroPrecision: round(averageNullable(classMetrics.map((item) => item.precision))),
      macroRecall: round(averageNullable(classMetrics.map((item) => item.recall))),
      macroF1: round(averageNullable(classMetrics.map((item) => item.f1))),
      falseGapPositiveCount,
      falseGapPositiveRate: round(divide(falseGapPositiveCount, goldNonGaps)),
      confusionMatrix,
      classMetrics,
    },
    retrieval: {
      k,
      precisionAtK: round(average(precisionAtK)),
      recallAtK: round(average(recallAtK)),
      meanReciprocalRank: round(average(reciprocalRanks)),
    },
    humanInLoop: {
      expertReviewRate: round(divide(
        runs.filter((run) => run.predictedState === "expertReviewRequired").length,
        runs.length,
      )),
      nonAbstainedAccuracy: round(divide(nonAbstainedCorrect, nonAbstained.length)),
      expertDisagreementRate: round(divide(disagreements, nonAbstained.length)),
    },
    traceability: {
      citationCorrectness: booleanRate(citations),
      scopeMatchCorrectness: booleanRate(scopes),
      temporalMatchCorrectness: booleanRate(temporals),
      humanRatings: {
        count: humanRatings.length,
        evidenceRelevance: round(average(humanRatings.map((item) => item.evidenceRelevance))),
        explanationClarity: round(average(humanRatings.map((item) => item.explanationClarity))),
        understandability: round(average(humanRatings.map((item) => item.understandability))),
        usefulness: round(average(humanRatings.map((item) => item.usefulness))),
        traceability: round(average(humanRatings.map((item) => item.traceability))),
      },
    },
  };
}
