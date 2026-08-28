import { z } from "zod";

export const QaSarBookSectionReviewDecisionSchema = z.enum([
  "approved",
  "changesRequested",
]);

export const CreateQaSarBookSectionReviewSchema = z.object({
  programmeId: z.string().trim().min(1),
  revisionId: z.string().uuid(),
  decision: QaSarBookSectionReviewDecisionSchema,
  comment: z.string().trim().min(1).max(4000),
});

export const QaSarBookSectionReviewViewSchema = z.object({
  id: z.string().uuid(),
  programmeId: z.string().trim().min(1),
  cycleId: z.string().trim().min(1),
  sectionKey: z.string().trim().min(1),
  sectionTitle: z.string().trim().min(1),
  revisionId: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  decision: QaSarBookSectionReviewDecisionSchema,
  comment: z.string(),
  reviewer: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1),
  }),
  createdAt: z.string().datetime(),
});

export const QaSarBookStaticSectionReadinessStatusSchema = z.enum([
  "missing",
  "pendingReview",
  "changesRequested",
  "approved",
]);

export const QaSarBookStaticSectionReadinessSchema = z.object({
  part: z.enum(["part1", "part3", "part4"]),
  sectionKey: z.string().trim().min(1),
  sectionTitle: z.string().trim().min(1),
  source: z.enum(["bookNarrative", "structured"]),
  required: z.boolean(),
  revisionId: z.string().uuid().nullable(),
  revisionNumber: z.number().int().positive().nullable(),
  contentReady: z.boolean(),
  reviewStatus: QaSarBookStaticSectionReadinessStatusSchema,
  latestReview: QaSarBookSectionReviewViewSchema.nullable(),
});

export const QaSarBookReadinessBlockerTypeSchema = z.enum([
  "missingSection",
  "sectionReviewPending",
  "sectionChangesRequested",
  "requirementNotApproved",
  "invalidRequirementPin",
  "brokenEvidence",
]);

export const QaSarBookReadinessBlockerSchema = z.object({
  type: QaSarBookReadinessBlockerTypeSchema,
  part: z.enum(["part1", "part2", "part3", "part4"]),
  sectionKey: z.string().trim().min(1).nullable(),
  requirementCode: z.string().trim().min(1).nullable(),
  message: z.string().trim().min(1),
});

export const QaSarBookCriterionReadinessSchema = z.object({
  criterionCode: z.string().trim().min(1),
  criterionTitle: z.string().trim().min(1),
  total: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  changesRequested: z.number().int().nonnegative(),
  brokenEvidenceReferences: z.number().int().nonnegative(),
});

export const QaSarBookPartReadinessSchema = z.object({
  part: z.enum(["part1", "part2", "part3", "part4"]),
  title: z.string().trim().min(1),
  total: z.number().int().nonnegative(),
  ready: z.number().int().nonnegative(),
  blockers: z.number().int().nonnegative(),
});

export const QaSarBookReviewReadinessViewSchema = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().trim().min(1),
  generatedAt: z.string().datetime(),
  readyForFinalisation: z.boolean(),
  note: z.literal("Workflow readiness only — not an AUN-QA compliance score or accreditation verdict."),
  parts: z.array(QaSarBookPartReadinessSchema).length(4),
  staticSections: z.array(QaSarBookStaticSectionReadinessSchema),
  criteria: z.array(QaSarBookCriterionReadinessSchema),
  blockers: z.array(QaSarBookReadinessBlockerSchema),
});

export type QaSarBookSectionReviewDecision = z.infer<typeof QaSarBookSectionReviewDecisionSchema>;
export type CreateQaSarBookSectionReviewInput = z.infer<typeof CreateQaSarBookSectionReviewSchema>;
export type QaSarBookSectionReviewView = z.infer<typeof QaSarBookSectionReviewViewSchema>;
export type QaSarBookStaticSectionReadiness = z.infer<typeof QaSarBookStaticSectionReadinessSchema>;
export type QaSarBookReadinessBlocker = z.infer<typeof QaSarBookReadinessBlockerSchema>;
export type QaSarBookCriterionReadiness = z.infer<typeof QaSarBookCriterionReadinessSchema>;
export type QaSarBookPartReadiness = z.infer<typeof QaSarBookPartReadinessSchema>;
export type QaSarBookReviewReadinessView = z.infer<typeof QaSarBookReviewReadinessViewSchema>;
