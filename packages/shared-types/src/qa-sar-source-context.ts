import { z } from "zod";
import { QaEvidenceAnalysisStateSchema } from "./qa-analysis.ts";

export const QaSarSourceBlockAvailabilitySchema = z.enum([
  "available",
  "unavailable",
  "restricted",
  "error",
]);

export const QaSarSourceProvenanceSchema = z.object({
  sourceDomain: z.string().trim().min(1),
  entityType: z.string().trim().min(1),
  entityId: z.string().trim().min(1),
  route: z.string().nullable(),
  authority: z.string().trim().min(1),
  ownerUnit: z.string().nullable(),
  version: z.string().nullable(),
  approvalStatus: z.string().nullable(),
});

const BaseBlockSchema = z.object({
  id: z.string().trim().min(1),
  registryKey: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string(),
  availability: QaSarSourceBlockAvailabilitySchema,
  reportingPeriod: z.object({
    start: z.string().datetime().nullable(),
    end: z.string().datetime().nullable(),
    label: z.string().nullable(),
  }),
  generatedAt: z.string().datetime(),
  snapshotKey: z.string().trim().min(1),
  provenance: z.array(QaSarSourceProvenanceSchema),
  message: z.string().nullable(),
});

export const QaSarScalarSourceBlockSchema = BaseBlockSchema.extend({
  kind: z.literal("scalar"),
  value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  unit: z.string().nullable(),
});

export const QaSarTrendSourceBlockSchema = BaseBlockSchema.extend({
  kind: z.literal("trend"),
  points: z.array(z.object({
    period: z.string().trim().min(1),
    value: z.number(),
  })),
  unit: z.string().nullable(),
});

export const QaSarTableSourceBlockSchema = BaseBlockSchema.extend({
  kind: z.literal("table"),
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
});

export const QaSarRecordListSourceBlockSchema = BaseBlockSchema.extend({
  kind: z.literal("recordList"),
  records: z.array(z.object({
    key: z.string().trim().min(1),
    title: z.string().trim().min(1),
    summary: z.string(),
    periodKey: z.string().nullable(),
  })),
});

export const QaSarSourceBlockSchema = z.discriminatedUnion("kind", [
  QaSarScalarSourceBlockSchema,
  QaSarTrendSourceBlockSchema,
  QaSarTableSourceBlockSchema,
  QaSarRecordListSourceBlockSchema,
]);

export const QaSarRequirementSourceContextSchema = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().trim().min(1),
  requirementCode: z.string().trim().min(1),
  requirementTitle: z.string().trim().min(1),
  requirementText: z.string(),
  diagnosticPrompts: z.array(z.string()),
  evidenceGapState: QaEvidenceAnalysisStateSchema.nullable(),
  evidenceGapExplanation: z.string().nullable(),
  sourceBlocks: z.array(QaSarSourceBlockSchema),
  generatedAt: z.string().datetime(),
});

export type QaSarSourceBlock = z.infer<typeof QaSarSourceBlockSchema>;
export type QaSarRequirementSourceContext = z.infer<typeof QaSarRequirementSourceContextSchema>;
