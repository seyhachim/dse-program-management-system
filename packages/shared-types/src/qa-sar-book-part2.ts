import { z } from "zod";
import { QaSarDocumentSchema } from "./qa-sar.ts";

export const QaSarBookPart2WorkflowStatusSchema = z.enum([
  "notStarted",
  "draft",
  "submitted",
  "changesRequested",
  "approved",
]);

export const QaSarBookPart2SourceKindSchema = z.enum([
  "current",
  "submission",
  "approvedSubmission",
]);

export const QaSarBookPart2SourceSchema = z.object({
  kind: QaSarBookPart2SourceKindSchema,
  sectionId: z.string().trim().min(1),
  submissionId: z.string().trim().min(1).nullable(),
  submissionVersion: z.number().int().positive().nullable(),
  content: QaSarDocumentSchema,
  plainText: z.string(),
  evidenceIds: z.array(z.string().trim().min(1)),
  capturedAt: z.string().datetime().nullable(),
});

export const QaSarBookPart2AssignmentSchema = z.object({
  assignmentId: z.string().trim().min(1),
  assignee: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    email: z.string().email(),
  }),
});

export const QaSarBookPart2RequirementSchema = z.object({
  requirementId: z.string().trim().min(1),
  requirementCode: z.string().trim().min(1),
  requirementTitle: z.string().trim().min(1),
  order: z.number().int().positive(),
  workflowStatus: QaSarBookPart2WorkflowStatusSchema,
  assignment: QaSarBookPart2AssignmentSchema.nullable(),
  currentSource: QaSarBookPart2SourceSchema.nullable(),
  latestSubmission: QaSarBookPart2SourceSchema.nullable(),
  approvedSubmission: QaSarBookPart2SourceSchema.nullable(),
  officialPin: z
    .object({
      submissionId: z.string().trim().min(1),
      submissionVersion: z.number().int().positive(),
    })
    .nullable(),
  brokenEvidenceReferenceIds: z.array(z.string().trim().min(1)),
});

export const QaSarBookPart2RollupSchema = z.object({
  total: z.number().int().nonnegative(),
  notStarted: z.number().int().nonnegative(),
  draft: z.number().int().nonnegative(),
  submitted: z.number().int().nonnegative(),
  changesRequested: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  unassigned: z.number().int().nonnegative(),
  brokenEvidenceReferences: z.number().int().nonnegative(),
});

export const QaSarBookPart2CriterionSchema = z.object({
  criterionId: z.string().trim().min(1),
  criterionCode: z.string().trim().min(1),
  criterionTitle: z.string().trim().min(1),
  order: z.number().int().positive(),
  rollup: QaSarBookPart2RollupSchema,
  requirements: z.array(QaSarBookPart2RequirementSchema),
});

export const QaSarBookPart2ViewSchema = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().trim().min(1),
  generatedAt: z.string().datetime(),
  criteria: z.array(QaSarBookPart2CriterionSchema),
  totals: QaSarBookPart2RollupSchema,
});

export type QaSarBookPart2WorkflowStatus = z.infer<typeof QaSarBookPart2WorkflowStatusSchema>;
export type QaSarBookPart2Source = z.infer<typeof QaSarBookPart2SourceSchema>;
export type QaSarBookPart2Requirement = z.infer<typeof QaSarBookPart2RequirementSchema>;
export type QaSarBookPart2Rollup = z.infer<typeof QaSarBookPart2RollupSchema>;
export type QaSarBookPart2Criterion = z.infer<typeof QaSarBookPart2CriterionSchema>;
export type QaSarBookPart2View = z.infer<typeof QaSarBookPart2ViewSchema>;
