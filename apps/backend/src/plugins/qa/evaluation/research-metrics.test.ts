import { expect, test } from "bun:test";
import { calculateQaResearchMetrics } from "./research-metrics.ts";

const evidence = (
  id: string,
  relevance: number,
  goldRelevant: boolean,
  options: { citation?: boolean; scope?: boolean; temporal?: boolean } = {},
) => ({
  scenarioEvidenceId: id,
  relevance,
  goldRelevant,
  citationCorrect: options.citation ?? true,
  scopeMatch: options.scope ?? true,
  temporalMatch: options.temporal ?? true,
});

test("research metrics report ranked retrieval, confusion and explicit false-gap errors", () => {
  const metrics = calculateQaResearchMetrics(
    [
      {
        predictedState: "evidenceIdentified",
        goldState: "evidenceIdentified",
        goldRelevantEvidenceCount: 2,
        retrievedEvidence: [
          evidence("b", 0.7, false),
          evidence("a", 0.9, true),
          evidence("c", 0.6, true),
        ],
      },
      {
        predictedState: "potentialEvidenceGap",
        goldState: "evidenceIdentified",
        goldRelevantEvidenceCount: 1,
        retrievedEvidence: [evidence("d", 0.8, false, { scope: false })],
      },
      {
        predictedState: "expertReviewRequired",
        goldState: "potentialEvidenceGap",
        goldRelevantEvidenceCount: 0,
        retrievedEvidence: [],
      },
    ],
    [],
    2,
  );

  expect(metrics.labelledRuns).toBe(3);
  expect(metrics.classification.falseGapPositiveCount).toBe(1);
  expect(metrics.classification.falseGapPositiveRate).toBe(0.5);
  expect(metrics.classification.confusionMatrix.find(
    (cell) => cell.gold === "evidenceIdentified" && cell.predicted === "potentialEvidenceGap",
  )?.count).toBe(1);
  expect(metrics.retrieval.precisionAtK).toBe(0.25);
  expect(metrics.retrieval.recallAtK).toBe(0.25);
  expect(metrics.retrieval.meanReciprocalRank).toBe(0.5);
  expect(metrics.humanInLoop.expertReviewRate).toBe(0.333333);
  expect(metrics.humanInLoop.nonAbstainedAccuracy).toBe(0.5);
  expect(metrics.humanInLoop.expertDisagreementRate).toBe(0.5);
  expect(metrics.traceability.scopeMatchCorrectness).toBe(0.75);
});

test("research metrics are deterministic when relevance scores tie", () => {
  const runs = [{
    predictedState: "evidenceIdentified" as const,
    goldState: "evidenceIdentified" as const,
    goldRelevantEvidenceCount: 1,
    retrievedEvidence: [
      evidence("z-evidence", 0.8, false),
      evidence("a-evidence", 0.8, true),
    ],
  }];
  const first = calculateQaResearchMetrics(runs, [], 1);
  const second = calculateQaResearchMetrics([...runs], [], 1);
  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  expect(first.retrieval.meanReciprocalRank).toBe(1);
});

test("human ratings are summarized without reviewer identity", () => {
  const metrics = calculateQaResearchMetrics([], [{
    evidenceRelevance: 4,
    explanationClarity: 5,
    understandability: 4,
    usefulness: 3,
    traceability: 5,
  }], 5);
  expect(metrics.traceability.humanRatings).toEqual({
    count: 1,
    evidenceRelevance: 4,
    explanationClarity: 5,
    understandability: 4,
    usefulness: 3,
    traceability: 5,
  });
});
