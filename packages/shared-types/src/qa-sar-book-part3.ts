import { z } from "zod";
import { QaImprovementActionStatusSchema } from "./qa-actions.ts";

export const QaSarSelfRatingSchema = z.number().int().min(1).max(7);

export const UpdateQaSarRequirementSelfRatingSchema = z.object({
  programmeId: z.string().trim().min(1),
  rating: QaSarSelfRatingSchema,
  justification: z.string().trim().min(10).max(5000),
  evidenceIds: z.array(z.string().uuid()).max(50).default([]),
});

export const UpdateQaSarCriterionSelfRatingSchema = z.object({
  programmeId: z.string().trim().min(1),
  rating: QaSarSelfRatingSchema,
  opinion: z.string().trim().min(10).max(5000),
  evidenceIds: z.array(z.string().uuid()).max(50).default([]),
});

export const QaSarBookPart3AssociationKindSchema = z.enum(["strength", "weakness"]);
export const UpsertQaSarBookPart3AssociationSchema = z.object({
  programmeId: z.string().trim().min(1),
  revisionId: z.string().uuid(),
  kind: QaSarBookPart3AssociationKindSchema,
  criterionCode: z.string().trim().min(1).nullable().default(null),
  requirementCode: z.string().trim().min(1).nullable().default(null),
}).superRefine((value, ctx) => {
  if (!value.criterionCode && !value.requirementCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a criterion or requirement", path: ["criterionCode"] });
  }
});

export const QaSarBookPart3EvidenceReferenceSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1),
  status: z.enum(["draft", "ready", "reviewed"]),
});

export const QaSarBookPart3RequirementRatingSchema = z.object({
  requirementId: z.string().uuid(),
  requirementCode: z.string().trim().min(1),
  requirementTitle: z.string().trim().min(1),
  rating: QaSarSelfRatingSchema.nullable(),
  justification: z.string(),
  evidence: z.array(QaSarBookPart3EvidenceReferenceSchema),
  enteredBy: z.object({ id: z.string().uuid(), name: z.string().trim().min(1) }).nullable(),
  updatedAt: z.string().datetime().nullable(),
  revisionId: z.string().uuid().nullable(),
  revisionNumber: z.number().int().positive().nullable(),
});

export const QaSarBookPart3CriterionRatingSchema = z.object({
  criterionId: z.string().uuid(),
  criterionCode: z.string().trim().min(1),
  criterionTitle: z.string().trim().min(1),
  rating: QaSarSelfRatingSchema.nullable(),
  opinion: z.string(),
  evidence: z.array(QaSarBookPart3EvidenceReferenceSchema),
  enteredBy: z.object({ id: z.string().uuid(), name: z.string().trim().min(1) }).nullable(),
  updatedAt: z.string().datetime().nullable(),
  revisionId: z.string().uuid().nullable(),
  revisionNumber: z.number().int().positive().nullable(),
  requirements: z.array(QaSarBookPart3RequirementRatingSchema),
});

export const QaSarBookPart3NarrativeAssociationSchema = z.object({
  id: z.string().uuid(),
  kind: QaSarBookPart3AssociationKindSchema,
  sectionKey: z.enum(["part3.strengths", "part3.weaknesses"]),
  revisionId: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  criterionCode: z.string().nullable(),
  criterionTitle: z.string().nullable(),
  requirementCode: z.string().nullable(),
  requirementTitle: z.string().nullable(),
  createdBy: z.object({ id: z.string().uuid(), name: z.string().trim().min(1) }),
  createdAt: z.string().datetime(),
});

export const QaSarBookPart3ImprovementActionSchema = z.object({
  id: z.string().uuid(),
  requirementCode: z.string().trim().min(1),
  plannedAction: z.string().trim().min(1),
  indicator: z.string(),
  ownerId: z.string().uuid().nullable(),
  ownerName: z.string().nullable(),
  dueDate: z.string().datetime().nullable(),
  status: QaImprovementActionStatusSchema,
  result: z.string(),
  effectivenessReview: z.string(),
  overdue: z.boolean(),
  followUpEvidenceCount: z.number().int().nonnegative(),
  sourceAnalysisId: z.string().uuid(),
  sourceReviewId: z.string().uuid(),
});

export const QaSarBookPart3ViewSchema = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  note: z.literal("Human self-assessment only — ratings are not external assessor scores or an accreditation verdict."),
  criteria: z.array(QaSarBookPart3CriterionRatingSchema),
  associations: z.array(QaSarBookPart3NarrativeAssociationSchema),
  improvementActions: z.array(QaSarBookPart3ImprovementActionSchema),
  readiness: z.object({
    totalRequirements: z.number().int().nonnegative(),
    ratedRequirements: z.number().int().nonnegative(),
    totalCriteria: z.number().int().nonnegative(),
    ratedCriteria: z.number().int().nonnegative(),
    missingRequirementRatings: z.array(z.string()),
    missingCriterionRatings: z.array(z.string()),
  }),
});

export type QaSarSelfRating = z.infer<typeof QaSarSelfRatingSchema>;
export type UpdateQaSarRequirementSelfRatingInput = z.infer<typeof UpdateQaSarRequirementSelfRatingSchema>;
export type UpdateQaSarCriterionSelfRatingInput = z.infer<typeof UpdateQaSarCriterionSelfRatingSchema>;
export type UpsertQaSarBookPart3AssociationInput = z.infer<typeof UpsertQaSarBookPart3AssociationSchema>;
export type QaSarBookPart3View = z.infer<typeof QaSarBookPart3ViewSchema>;
export type QaSarBookPart3NarrativeAssociation = z.infer<typeof QaSarBookPart3NarrativeAssociationSchema>;
