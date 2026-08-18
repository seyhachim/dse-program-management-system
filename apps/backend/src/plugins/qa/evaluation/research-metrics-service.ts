import {
  AUN_QA_V4_ID,
  QaEvaluationScenarioTypeSchema,
  type QaEvidenceAnalysisState,
  type QaResearchMetricsGroupKey,
  type QaResearchMetricsQuery,
  type QaResearchMetricsReport,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  calculateQaResearchMetrics,
  type ResearchMetricEvidence,
  type ResearchMetricHumanRating,
  type ResearchMetricRun,
} from "./research-metrics.ts";

type DbState = "EvidenceIdentified" | "PotentialEvidenceGap" | "ExpertReviewRequired";

const fromDbState: Record<DbState, QaEvidenceAnalysisState> = {
  EvidenceIdentified: "evidenceIdentified",
  PotentialEvidenceGap: "potentialEvidenceGap",
  ExpertReviewRequired: "expertReviewRequired",
};

type RunRow = {
  id: string;
  predictedState: DbState | null;
  predictedApplicability: string;
  engine: string;
  engineVersion: string;
  promptVersion: string;
  requirementCode: string;
  expectationId: string;
  goldState: DbState | null;
  goldApplicability: string | null;
  scenarioType: string;
  datasetVersion: string;
  scenarioVersion: number;
};

type RetrievalRow = {
  runId: string;
  scenarioEvidenceId: string;
  relevance: number | null;
  goldRelevant: boolean | null;
  referenceKey: string;
  provenance: unknown;
  scenarioType: string;
  datasetVersion: string;
};

type RatingRow = ResearchMetricHumanRating & { runId: string };

type GoldCountRow = { scenarioId: string; count: bigint };

interface PreparedRun extends ResearchMetricRun {
  id: string;
  key: QaResearchMetricsGroupKey;
}

function citationCorrect(referenceKey: string, provenance: unknown): boolean | null {
  if (!referenceKey.trim()) return false;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return null;
  const authority = (provenance as Record<string, unknown>).authority;
  if (typeof authority !== "string") return null;
  return authority !== "unknown";
}

function scenarioTypeFor(row: Pick<RunRow, "scenarioType" | "datasetVersion">) {
  if (row.datasetVersion === "legacy") return "legacy" as const;
  return QaEvaluationScenarioTypeSchema.parse(row.scenarioType);
}

function groupKey(row: RunRow): QaResearchMetricsGroupKey {
  return {
    criterion: row.requirementCode.split(".")[0] ?? row.requirementCode,
    requirementCode: row.requirementCode,
    expectationId: row.expectationId,
    scenarioType: scenarioTypeFor(row),
    datasetVersion: row.datasetVersion,
    scenarioVersion: row.scenarioVersion,
    engine: row.engine,
    engineVersion: row.engineVersion,
    promptVersion: row.promptVersion,
  };
}

function matches(row: RunRow, filters: QaResearchMetricsQuery): boolean {
  const key = groupKey(row);
  return (
    (!filters.criterion || key.criterion === filters.criterion) &&
    (!filters.requirementCode || key.requirementCode === filters.requirementCode) &&
    (!filters.expectationId || key.expectationId === filters.expectationId) &&
    (!filters.scenarioType || key.scenarioType === filters.scenarioType) &&
    (!filters.datasetVersion || key.datasetVersion === filters.datasetVersion) &&
    (!filters.scenarioVersion || key.scenarioVersion === filters.scenarioVersion) &&
    (!filters.engine || key.engine === filters.engine) &&
    (!filters.engineVersion || key.engineVersion === filters.engineVersion) &&
    (filters.promptVersion === undefined || key.promptVersion === filters.promptVersion)
  );
}

function stableKey(key: QaResearchMetricsGroupKey): string {
  return [
    key.criterion,
    key.requirementCode,
    key.expectationId,
    key.scenarioType,
    key.datasetVersion,
    String(key.scenarioVersion),
    key.engine,
    key.engineVersion,
    key.promptVersion,
  ].join("\u001f");
}

export async function getQaResearchMetricsReport(
  filters: QaResearchMetricsQuery,
): Promise<QaResearchMetricsReport> {
  const [runRows, retrievalRows, ratingRows, goldCountRows] = await Promise.all([
    prisma.$queryRaw<RunRow[]>`
      SELECT run.id,
             run."predictedState",
             run."predictedApplicability",
             run.engine,
             run."engineVersion",
             run."promptVersion",
             req.code AS "requirementCode",
             scenario."expectationId",
             scenario."goldState",
             scenario."goldApplicability",
             scenario."scenarioType",
             scenario."datasetVersion",
             scenario."scenarioVersion"
      FROM "QaEvaluationRun" run
      JOIN "QaEvaluationScenario" scenario ON scenario.id = run."scenarioId"
      JOIN "QaRequirement" req ON req.id = scenario."requirementId"
      ORDER BY run.id ASC
    `,
    prisma.$queryRaw<RetrievalRow[]>`
      SELECT re."runId",
             re."scenarioEvidenceId",
             re.relevance,
             evidence."goldRelevant",
             evidence."referenceKey",
             evidence.provenance,
             scenario."scenarioType",
             scenario."datasetVersion"
      FROM "QaEvaluationRunEvidence" re
      JOIN "QaEvaluationScenarioEvidence" evidence ON evidence.id = re."scenarioEvidenceId"
      JOIN "QaEvaluationScenario" scenario ON scenario.id = evidence."scenarioId"
      ORDER BY re."runId" ASC, re."scenarioEvidenceId" ASC
    `,
    prisma.$queryRaw<RatingRow[]>`
      SELECT "runId",
             "evidenceRelevance",
             "explanationClarity",
             understandability,
             usefulness,
             traceability
      FROM "QaEvaluationHumanRating"
      ORDER BY "runId" ASC, id ASC
    `,
    prisma.$queryRaw<GoldCountRow[]>`
      SELECT "scenarioId", COUNT(*) FILTER (WHERE "goldRelevant" = TRUE)::bigint AS count
      FROM "QaEvaluationScenarioEvidence"
      GROUP BY "scenarioId"
    `,
  ]);

  const filteredRows = runRows.filter((row) => matches(row, filters));
  const includedRunIds = new Set(filteredRows.map((row) => row.id));
  const retrievalByRun = new Map<string, ResearchMetricEvidence[]>();
  for (const item of retrievalRows) {
    if (!includedRunIds.has(item.runId)) continue;
    const list = retrievalByRun.get(item.runId) ?? [];
    const versionedType = item.datasetVersion === "legacy"
      ? "legacy"
      : QaEvaluationScenarioTypeSchema.parse(item.scenarioType);
    list.push({
      scenarioEvidenceId: item.scenarioEvidenceId,
      relevance: item.relevance,
      goldRelevant: item.goldRelevant,
      citationCorrect: citationCorrect(item.referenceKey, item.provenance),
      scopeMatch: versionedType === "legacy" ? null : versionedType !== "wrongScope",
      temporalMatch: versionedType === "legacy" ? null : versionedType !== "staleEvidence",
    });
    retrievalByRun.set(item.runId, list);
  }

  const goldCountByScenario = new Map(goldCountRows.map((row) => [row.scenarioId, Number(row.count)]));
  const scenarioIdRows = await prisma.$queryRaw<Array<{ id: string; scenarioId: string }>>`
    SELECT id, "scenarioId" FROM "QaEvaluationRun" ORDER BY id ASC
  `;
  const scenarioByRun = new Map(scenarioIdRows.map((row) => [row.id, row.scenarioId]));

  const prepared: PreparedRun[] = filteredRows
    .filter((row): row is RunRow & { predictedState: DbState; goldState: DbState } =>
      row.predictedApplicability === "applicable" &&
      row.goldApplicability === "applicable" &&
      row.predictedState !== null &&
      row.goldState !== null,
    )
    .map((row) => ({
      id: row.id,
      key: groupKey(row),
      predictedState: fromDbState[row.predictedState],
      goldState: fromDbState[row.goldState],
      retrievedEvidence: retrievalByRun.get(row.id) ?? [],
      goldRelevantEvidenceCount: goldCountByScenario.get(scenarioByRun.get(row.id) ?? "") ?? 0,
    }));

  const ratingsByRun = new Map<string, ResearchMetricHumanRating[]>();
  for (const rating of ratingRows) {
    if (!includedRunIds.has(rating.runId)) continue;
    const list = ratingsByRun.get(rating.runId) ?? [];
    list.push(rating);
    ratingsByRun.set(rating.runId, list);
  }
  const allRatings = prepared.flatMap((run) => ratingsByRun.get(run.id) ?? []);

  const grouped = new Map<string, PreparedRun[]>();
  for (const run of prepared) {
    const key = stableKey(run.key);
    const list = grouped.get(key) ?? [];
    list.push(run);
    grouped.set(key, list);
  }

  const groups = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, runs]) => ({
      key: runs[0]!.key,
      metrics: calculateQaResearchMetrics(
        runs,
        runs.flatMap((run) => ratingsByRun.get(run.id) ?? []),
        filters.k,
      ),
    }));

  return {
    schemaVersion: "qa-research-metrics-v1",
    frameworkId: AUN_QA_V4_ID,
    filters,
    overall: calculateQaResearchMetrics(prepared, allRatings, filters.k),
    groups,
  };
}
