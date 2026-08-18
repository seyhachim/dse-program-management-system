import { z } from "zod";
import {
  QaEvaluationScenarioTypeSchema,
  type QaEvaluationScenarioType,
} from "./qa-evaluation.ts";
import type { QaEvidenceAnalysisState } from "./qa-analysis.ts";

export const QaResearchMetricsQuerySchema = z.object({
  criterion: z.string().trim().regex(/^\d+$/).optional(),
  requirementCode: z.string().trim().regex(/^\d\.\d$/).optional(),
  expectationId: z.string().trim().min(1).max(200).optional(),
  scenarioType: QaEvaluationScenarioTypeSchema.optional(),
  datasetVersion: z.string().trim().min(1).max(120).optional(),
  scenarioVersion: z.coerce.number().int().positive().optional(),
  engine: z.string().trim().min(1).max(100).optional(),
  engineVersion: z.string().trim().min(1).max(100).optional(),
  promptVersion: z.string().trim().max(100).optional(),
  k: z.coerce.number().int().min(1).max(100).default(5),
});

export type QaResearchMetricsQuery = z.infer<typeof QaResearchMetricsQuerySchema>;

export interface QaResearchMetricsGroupKey {
  criterion: string;
  requirementCode: string;
  expectationId: string;
  scenarioType: QaEvaluationScenarioType | "legacy";
  datasetVersion: string;
  scenarioVersion: number;
  engine: string;
  engineVersion: string;
  promptVersion: string;
}

export interface QaResearchConfusionCell {
  gold: QaEvidenceAnalysisState;
  predicted: QaEvidenceAnalysisState;
  count: number;
}

export interface QaResearchClassMetric {
  label: QaEvidenceAnalysisState;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface QaResearchMetricSummary {
  labelledRuns: number;
  classification: {
    accuracy: number | null;
    macroPrecision: number | null;
    macroRecall: number | null;
    macroF1: number | null;
    falseGapPositiveCount: number;
    falseGapPositiveRate: number | null;
    confusionMatrix: QaResearchConfusionCell[];
    classMetrics: QaResearchClassMetric[];
  };
  retrieval: {
    k: number;
    precisionAtK: number | null;
    recallAtK: number | null;
    meanReciprocalRank: number | null;
  };
  humanInLoop: {
    expertReviewRate: number | null;
    nonAbstainedAccuracy: number | null;
    expertDisagreementRate: number | null;
  };
  traceability: {
    citationCorrectness: number | null;
    scopeMatchCorrectness: number | null;
    temporalMatchCorrectness: number | null;
    humanRatings: {
      count: number;
      evidenceRelevance: number | null;
      explanationClarity: number | null;
      understandability: number | null;
      usefulness: number | null;
      traceability: number | null;
    };
  };
}

export interface QaResearchMetricsGroup {
  key: QaResearchMetricsGroupKey;
  metrics: QaResearchMetricSummary;
}

export interface QaResearchMetricsReport {
  schemaVersion: "qa-research-metrics-v1";
  frameworkId: string;
  filters: QaResearchMetricsQuery;
  overall: QaResearchMetricSummary;
  groups: QaResearchMetricsGroup[];
}
