import { beforeAll, describe, expect, test } from "bun:test";
import { QA_CRITERIA_1_4_8_DATASET_VERSION } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  exportQaCriteria148Dataset,
  initializeQaCriteria148Dataset,
} from "./controlled-dataset.ts";
import { getQaResearchMetricsReport } from "./research-metrics-service.ts";
import {
  createQaEvaluationHumanRating,
  createQaEvaluationRun,
  setQaEvaluationGold,
} from "./service.ts";

const runDbTests = process.env.QA_RESEARCH_METRICS_DB_TESTS === "1";
const describeDb = runDbTests ? describe : describe.skip;

describeDb("reproducible QA research metrics", () => {
  let expectationId = "";

  beforeAll(async () => {
    await initializeQaCriteria148Dataset();
    const dataset = await exportQaCriteria148Dataset();
    const reviewer = await prisma.user.findFirstOrThrow({ select: { id: true } });

    const positive = dataset.scenarios.find(
      (scenario) => scenario.requirementCode === "1.2" && scenario.scenarioType === "positiveEvidence",
    );
    const missing = dataset.scenarios.find(
      (scenario) => scenario.requirementCode === "1.2" && scenario.scenarioType === "missingEvidence",
    );
    const ambiguous = dataset.scenarios.find(
      (scenario) => scenario.requirementCode === "1.2" && scenario.scenarioType === "ambiguousRelationship",
    );
    if (!positive || !missing || !ambiguous) throw new Error("Expected controlled Criterion 1 scenarios");
    expectationId = positive.expectationId;

    await setQaEvaluationGold(positive.id, {
      goldApplicability: "applicable",
      goldState: "evidenceIdentified",
      note: "Human reference label for metric verification.",
      evidenceJudgments: positive.evidence.map((item) => ({ evidenceId: item.id, relevant: true })),
    }, reviewer.id);
    await setQaEvaluationGold(missing.id, {
      goldApplicability: "applicable",
      goldState: "potentialEvidenceGap",
      note: "Human reference label for intentionally missing evidence.",
      evidenceJudgments: [],
    }, reviewer.id);
    await setQaEvaluationGold(ambiguous.id, {
      goldApplicability: "applicable",
      goldState: "expertReviewRequired",
      note: "Human reference label for ambiguous evidence relationship.",
      evidenceJudgments: ambiguous.evidence.map((item) => ({ evidenceId: item.id, relevant: true })),
    }, reviewer.id);

    const falseGapRun = await createQaEvaluationRun({
      scenarioId: positive.id,
      predictedApplicability: "applicable",
      predictedState: "potentialEvidenceGap",
      engine: "deterministic-rules",
      engineVersion: "rules-v2",
      promptVersion: "",
      explanation: "Controlled false-positive gap prediction.",
      retrievedEvidence: positive.evidence.map((item, index) => ({
        scenarioEvidenceId: item.id,
        relevance: 0.9 - index * 0.1,
      })),
    });
    await createQaEvaluationHumanRating(falseGapRun.id, {
      evidenceRelevance: 4,
      explanationClarity: 4,
      understandability: 5,
      usefulness: 3,
      traceability: 5,
      comment: "Controlled human rating.",
    }, reviewer.id);

    await createQaEvaluationRun({
      scenarioId: missing.id,
      predictedApplicability: "applicable",
      predictedState: "potentialEvidenceGap",
      engine: "deterministic-rules",
      engineVersion: "rules-v2",
      promptVersion: "",
      explanation: "Controlled correct gap prediction.",
      retrievedEvidence: [],
    });

    await createQaEvaluationRun({
      scenarioId: ambiguous.id,
      predictedApplicability: "applicable",
      predictedState: "expertReviewRequired",
      engine: "llm-assisted",
      engineVersion: "model-a",
      promptVersion: "qa-match-v1",
      explanation: "Controlled abstention on ambiguous evidence.",
      retrievedEvidence: ambiguous.evidence.map((item, index) => ({
        scenarioEvidenceId: item.id,
        relevance: 0.8 - index * 0.05,
      })),
    });
  });

  test("same stored runs produce byte-stable metric output", async () => {
    const filters = { datasetVersion: QA_CRITERIA_1_4_8_DATASET_VERSION, k: 2 };
    const first = await getQaResearchMetricsReport(filters);
    const second = await getQaResearchMetricsReport(filters);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.schemaVersion).toBe("qa-research-metrics-v1");
    expect(first.overall.classification.falseGapPositiveCount).toBe(1);
    expect(first.overall.classification.confusionMatrix.length).toBe(9);
    expect(first.overall.retrieval.k).toBe(2);
    expect(first.overall.humanInLoop.expertReviewRate).toBe(0.333333);
  });

  test("filters and groups preserve criterion, expectation, scenario and engine versions", async () => {
    const report = await getQaResearchMetricsReport({
      criterion: "1",
      expectationId,
      scenarioType: "positiveEvidence",
      datasetVersion: QA_CRITERIA_1_4_8_DATASET_VERSION,
      scenarioVersion: 1,
      engine: "deterministic-rules",
      engineVersion: "rules-v2",
      promptVersion: "",
      k: 5,
    });
    expect(report.overall.labelledRuns).toBe(1);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]?.key).toMatchObject({
      criterion: "1",
      requirementCode: "1.2",
      expectationId,
      scenarioType: "positiveEvidence",
      datasetVersion: QA_CRITERIA_1_4_8_DATASET_VERSION,
      scenarioVersion: 1,
      engine: "deterministic-rules",
      engineVersion: "rules-v2",
      promptVersion: "",
    });
    expect(report.overall.classification.falseGapPositiveCount).toBe(1);
  });

  test("research report is aggregate-only and does not expose reviewer or student identity", async () => {
    const report = await getQaResearchMetricsReport({
      datasetVersion: QA_CRITERIA_1_4_8_DATASET_VERSION,
      k: 5,
    });
    const json = JSON.stringify(report);
    expect(json).not.toContain("reviewerId");
    expect(json).not.toContain("reviewerName");
    expect(json).not.toContain("studentId");
    expect(json).not.toContain("email");
    expect(report.overall.traceability.humanRatings.count).toBe(1);
  });
});
