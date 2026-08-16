import { z } from "zod";
import { QaEvidenceAnalysisStateSchema } from "./qa-analysis.ts";
import { QaEvidenceSourceDomainSchema } from "./qa-knowledge.ts";

export const QaEvaluationEvidenceAttributeValueSchema = z.union([
  z.string().max(5000),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const QaEvaluationScenarioEvidenceInputSchema = z.object({
  evidenceType: z.string().trim().max(120).default(""),
  sourceDomain: QaEvidenceSourceDomainSchema,
  entityType: z.string().trim().min(1).max(120).default("ControlledEvidence"),
  label: z.string().trim().min(1).max(300),
  text: z.string().trim().min(1).max(50_000),
  referenceKey: z.string().trim().max(500).default(""),
  reportingDate: z.coerce.date().nullable().optional().default(null),
  attributes: z.record(z.string(), QaEvaluationEvidenceAttributeValueSchema).default({}),
});

export const CreateQaEvaluationScenarioSchema = z.object({
  requirementCode: z.string().regex(/^\d\.\d$/),
  expectationId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(3).max(300),
  description: z.string().trim().min(10).max(5000),
  evidence: z.array(QaEvaluationScenarioEvidenceInputSchema).max(200).default([]),
});

export const SetQaEvaluationGoldSchema = z.object({
  goldState: QaEvidenceAnalysisStateSchema,
  note: z.string().trim().max(5000).default(""),
  evidenceJudgments: z.array(
    z.object({
      evidenceId: z.string().uuid(),
      relevant: z.boolean(),
    }),
  ).max(200).default([]),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  for (const [index, item] of value.evidenceJudgments.entries()) {
    if (ids.has(item.evidenceId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Gold evidence judgments must reference each evidence row at most once",
        path: ["evidenceJudgments", index, "evidenceId"],
      });
    }
    ids.add(item.evidenceId);
  }
});

export const CreateQaEvaluationRunSchema = z.object({
  scenarioId: z.string().uuid(),
  predictedState: QaEvidenceAnalysisStateSchema,
  engine: z.string().trim().min(1).max(100),
  engineVersion: z.string().trim().min(1).max(100),
  promptVersion: z.string().trim().max(100).default(""),
  explanation: z.string().trim().min(1).max(10_000),
  retrievedEvidence: z.array(
    z.object({
      scenarioEvidenceId: z.string().uuid(),
      relevance: z.number().min(0).max(1).nullable().optional().default(null),
    }),
  ).max(200).default([]),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  for (const [index, item] of value.retrievedEvidence.entries()) {
    if (ids.has(item.scenarioEvidenceId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A run cannot retrieve the same controlled evidence row twice",
        path: ["retrievedEvidence", index, "scenarioEvidenceId"],
      });
    }
    ids.add(item.scenarioEvidenceId);
  }
});

const EvaluationRatingSchema = z.number().int().min(1).max(5);
export const CreateQaEvaluationHumanRatingSchema = z.object({
  evidenceRelevance: EvaluationRatingSchema,
  explanationClarity: EvaluationRatingSchema,
  understandability: EvaluationRatingSchema,
  usefulness: EvaluationRatingSchema,
  traceability: EvaluationRatingSchema,
  comment: z.string().trim().max(5000).default(""),
});

export const QaEvaluationRunQuerySchema = z.object({
  engine: z.string().trim().min(1).max(100).optional(),
  engineVersion: z.string().trim().min(1).max(100).optional(),
  promptVersion: z.string().trim().max(100).optional(),
});

export interface QaEvaluationEvidenceView {
  id: string;
  scenarioId: string;
  order: number;
  evidenceType: string;
  sourceDomain: z.infer<typeof QaEvidenceSourceDomainSchema>;
  entityType: string;
  label: string;
  text: string;
  referenceKey: string;
  reportingDate: string | null;
  attributes: Record<string, z.infer<typeof QaEvaluationEvidenceAttributeValueSchema>>;
  goldRelevant: boolean | null;
}

export interface QaEvaluationScenarioView {
  id: string;
  requirementCode: string;
  expectationId: string;
  name: string;
  description: string;
  goldState: z.infer<typeof QaEvidenceAnalysisStateSchema> | null;
  goldReviewerId: string | null;
  goldReviewerName: string | null;
  goldAnnotatedAt: string | null;
  goldNote: string;
  evidence: QaEvaluationEvidenceView[];
  createdAt: string;
  updatedAt: string;
}

export interface QaEvaluationRunView {
  id: string;
  scenarioId: string;
  predictedState: z.infer<typeof QaEvidenceAnalysisStateSchema>;
  engine: string;
  engineVersion: string;
  promptVersion: string;
  explanation: string;
  createdAt: string;
  retrievedEvidence: Array<{
    scenarioEvidenceId: string;
    relevance: number | null;
  }>;
}

export interface QaEvaluationHumanRatingView {
  id: string;
  runId: string;
  reviewerId: string;
  reviewerName: string;
  evidenceRelevance: number;
  explanationClarity: number;
  understandability: number;
  usefulness: number;
  traceability: number;
  comment: string;
  createdAt: string;
}

export interface QaEvaluationClassMetrics {
  label: z.infer<typeof QaEvidenceAnalysisStateSchema>;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface QaEvaluationMetricsView {
  labelledRuns: number;
  accuracy: number | null;
  macroPrecision: number | null;
  macroRecall: number | null;
  macroF1: number | null;
  expertReviewReferralRate: number | null;
  falseGapPositiveCount: number;
  evidenceRetrievalPrecision: number | null;
  evidenceRetrievalRecall: number | null;
  classMetrics: QaEvaluationClassMetrics[];
  humanRatings: {
    count: number;
    evidenceRelevance: number | null;
    explanationClarity: number | null;
    understandability: number | null;
    usefulness: number | null;
    traceability: number | null;
  };
}
