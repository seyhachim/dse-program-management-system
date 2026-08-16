import {
  AUN_QA_V4_ID,
  QA_PILOT_SCENARIO_VERSION,
  QaEvidenceAnalysisStateSchema,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { calculateQaEvaluationMetrics } from "./metrics.ts";
import { getQaPilotStatus } from "./pilot-runner.ts";
import { listQaEvaluationRuns, listQaEvaluationScenarios } from "./service.ts";

const fromDbState = {
  EvidenceIdentified: "evidenceIdentified",
  PotentialEvidenceGap: "potentialEvidenceGap",
  ExpertReviewRequired: "expertReviewRequired",
} as const;

export async function getQaPilotMetrics() {
  const pilotWhere = { scenario: { name: { startsWith: `${QA_PILOT_SCENARIO_VERSION}:` } } } as const;
  const [runs, ratings] = await Promise.all([
    prisma.qaEvaluationRun.findMany({
      where: pilotWhere,
      include: {
        scenario: { include: { evidence: { select: { id: true, goldRelevant: true } } } },
        retrieved: { include: { scenarioEvidence: { select: { goldRelevant: true } } } },
      },
    }),
    prisma.qaEvaluationHumanRating.findMany({
      where: { run: pilotWhere },
      select: {
        evidenceRelevance: true,
        explanationClarity: true,
        understandability: true,
        usefulness: true,
        traceability: true,
      },
    }),
  ]);

  return calculateQaEvaluationMetrics(
    runs.map((run) => ({
      predictedState: QaEvidenceAnalysisStateSchema.parse(
        fromDbState[run.predictedState as keyof typeof fromDbState],
      ),
      goldState: run.scenario.goldState
        ? QaEvidenceAnalysisStateSchema.parse(
            fromDbState[run.scenario.goldState as keyof typeof fromDbState],
          )
        : null,
      retrievedEvidence: run.retrieved.map((item) => ({
        goldRelevant: item.scenarioEvidence.goldRelevant,
      })),
      goldRelevantEvidenceCount: run.scenario.evidence.filter((item) => item.goldRelevant === true).length,
    })),
    ratings,
  );
}

export async function exportQaPilotData() {
  const prefix = `${QA_PILOT_SCENARIO_VERSION}:`;
  const [allScenarios, allRuns, ratings, status, metrics] = await Promise.all([
    listQaEvaluationScenarios(),
    listQaEvaluationRuns(),
    prisma.qaEvaluationHumanRating.findMany({
      where: { run: { scenario: { name: { startsWith: prefix } } } },
      orderBy: { createdAt: "asc" },
      include: { reviewer: { select: { name: true } } },
    }),
    getQaPilotStatus(),
    getQaPilotMetrics(),
  ]);
  const scenarios = allScenarios.filter((scenario) => scenario.name.startsWith(prefix));
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  const runs = allRuns.filter((run) => scenarioIds.has(run.scenarioId));

  return {
    exportedAt: new Date().toISOString(),
    frameworkId: AUN_QA_V4_ID,
    pilotVersion: QA_PILOT_SCENARIO_VERSION,
    status,
    metrics,
    scenarios,
    runs,
    humanRatings: ratings.map((row) => ({
      id: row.id,
      runId: row.runId,
      reviewerId: row.reviewerId,
      reviewerName: row.reviewer.name,
      evidenceRelevance: row.evidenceRelevance,
      explanationClarity: row.explanationClarity,
      understandability: row.understandability,
      usefulness: row.usefulness,
      traceability: row.traceability,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
