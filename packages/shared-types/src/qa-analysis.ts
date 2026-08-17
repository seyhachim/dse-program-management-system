import { z } from "zod";
import { QaEvidenceSourceDomainSchema } from "./qa-knowledge.ts";
import {
  QaApplicabilityStateSchema,
  QaEvidenceProvenanceSchema,
  QaEvidenceScopeSchema,
  QaScopeMatchSchema,
  QaTemporalMatchSchema,
} from "./qa-evidence-semantics.ts";

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
  scope: QaEvidenceScopeSchema.default({}),
  scopeMatch: QaScopeMatchSchema.default("unknown"),
  temporalMatch: QaTemporalMatchSchema.default("unknown"),
  provenance: QaEvidenceProvenanceSchema.default({ authority: "unknown" }),
  authorityMatch: z.boolean().nullable().optional().default(null),
  periodKey: z.string().trim().max(200).nullable().optional().default(null),
});

export const CreateQaEvidenceAnalysisSchema = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().uuid(),
  requirementCode: z.string().regex(/^\d\.\d$/),
  expectationId: z.string().trim().min(1).max(200),
  applicability: QaApplicabilityStateSchema.default("applicable"),
  applicabilityReason: z.string().trim().max(5000).default(""),
  state: QaEvidenceAnalysisStateSchema.nullable().optional().default(null),
  explanation: z.string().trim().min(1).max(10000),
  confidence: z.number().min(0).max(1).nullable().optional().default(null),
  uncertaintyNote: z.string().trim().max(5000).default(""),
  engine: z.string().trim().min(1).max(100),
  engineVersion: z.string().trim().min(1).max(100),
  promptVersion: z.string().trim().max(100).default(""),
  sources: z.array(CreateQaEvidenceAnalysisSourceSchema).max(500).default([]),
}).superRefine((value, ctx) => {
  if (value.applicability === "applicable" && value.state === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Applicable analysis requires an evidence coverage state",
      path: ["state"],
    });
  }
  if (value.applicability !== "applicable" && value.state !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Non-applicable or uncertain analysis must bypass evidence coverage classification",
      path: ["state"],
    });
  }

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

// Use the schema input type so callers remain source-compatible with defaulted
// #296-#299 fields. createQaEvidenceAnalysis parses this into the fully normalized
// output shape before persistence.
export type CreateQaEvidenceAnalysisInput = z.input<typeof CreateQaEvidenceAnalysisSchema>;
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
  scope: z.infer<typeof QaEvidenceScopeSchema>;
  scopeMatch: z.infer<typeof QaScopeMatchSchema>;
  temporalMatch: z.infer<typeof QaTemporalMatchSchema>;
  provenance: z.infer<typeof QaEvidenceProvenanceSchema>;
  authorityMatch: boolean | null;
  periodKey: string | null;
  createdAt: string;
}

export interface QaEvidenceAnalysisView {
  id: string;
  programmeId: string;
  cycleId: string;
  requirementCode: string;
  expectationId: string;
  applicability: z.infer<typeof QaApplicabilityStateSchema>;
  applicabilityReason: string;
  state: QaEvidenceAnalysisState | null;
  explanation: string;
  confidence: number | null;
  uncertaintyNote: string;
  engine: string;
  engineVersion: string;
  promptVersion: string;
  createdAt: string;
  sources: QaEvidenceAnalysisSourceView[];
}
