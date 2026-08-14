import { z } from "zod";
import { QaEvidenceSourceDomainSchema } from "./qa-knowledge.ts";

export const QaEvidenceAnalysisStateSchema = z.enum([
  "evidenceIdentified",
  "potentialEvidenceGap",
  "expertReviewRequired",
]);

export const QaEvidenceAnalysisSourceKindSchema = z.enum([
  "structuredCandidate",
  "qaEvidence",
  "documentChunk",
]);

export type QaEvidenceAnalysisState = z.infer<typeof QaEvidenceAnalysisStateSchema>;
export type QaEvidenceAnalysisSourceKind = z.infer<typeof QaEvidenceAnalysisSourceKindSchema>;

export const CreateQaEvidenceAnalysisSourceSchema = z.object({
  sourceKind: QaEvidenceAnalysisSourceKindSchema,
  candidateKey: z.string().trim().min(1).max(500),
  sourceDomain: QaEvidenceSourceDomainSchema,
  entityType: z.string().trim().min(1).max(120),
  entityId: z.string().trim().min(1).max(500),
  qaEvidenceId: z.string().uuid().nullable().optional().default(null),
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(5000).default(""),
  excerpt: z.string().trim().max(10000).default(""),
  route: z.string().trim().max(500).nullable().optional().default(null),
  reportingDate: z.coerce.date().nullable().optional().default(null),
  relevance: z.number().min(0).max(1).nullable().optional().default(null),
});

export const CreateQaEvidenceAnalysisSchema = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().uuid(),
  requirementCode: z.string().regex(/^\d\.\d$/),
  expectationId: z.string().trim().min(1).max(200),
  state: QaEvidenceAnalysisStateSchema,
  explanation: z.string().trim().min(1).max(10000),
  confidence: z.number().min(0).max(1).nullable().optional().default(null),
  uncertaintyNote: z.string().trim().max(5000).default(""),
  engine: z.string().trim().min(1).max(100),
  engineVersion: z.string().trim().min(1).max(100),
  promptVersion: z.string().trim().max(100).default(""),
  sources: z.array(CreateQaEvidenceAnalysisSourceSchema).max(500).default([]),
}).superRefine((value, ctx) => {
  const keys = new Set<string>();
  for (const [index, source] of value.sources.entries()) {
    if (keys.has(source.candidateKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Analysis source candidate keys must be unique within one run",
        path: ["sources", index, "candidateKey"],
      });
    }
    keys.add(source.candidateKey);
  }
});

export const QaEvidenceAnalysisHistoryQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  requirementCode: z.string().regex(/^\d\.\d$/).optional(),
});

export const RunQaDeterministicAnalysisSchema = z.object({
  programmeId: z.string().trim().min(1),
});

export type CreateQaEvidenceAnalysisInput = z.infer<typeof CreateQaEvidenceAnalysisSchema>;
export type RunQaDeterministicAnalysisInput = z.infer<typeof RunQaDeterministicAnalysisSchema>;

export interface QaEvidenceAnalysisSourceView {
  id: string;
  sourceKind: QaEvidenceAnalysisSourceKind;
  candidateKey: string;
  sourceDomain: z.infer<typeof QaEvidenceSourceDomainSchema>;
  entityType: string;
  entityId: string;
  qaEvidenceId: string | null;
  title: string;
  summary: string;
  excerpt: string;
  route: string | null;
  reportingDate: string | null;
  relevance: number | null;
  createdAt: string;
}

export interface QaEvidenceAnalysisView {
  id: string;
  programmeId: string;
  cycleId: string;
  requirementCode: string;
  expectationId: string;
  state: QaEvidenceAnalysisState;
  explanation: string;
  confidence: number | null;
  uncertaintyNote: string;
  engine: string;
  engineVersion: string;
  promptVersion: string;
  createdAt: string;
  sources: QaEvidenceAnalysisSourceView[];
}
