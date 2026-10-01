import { z } from "zod";
import { QaSarDocumentSchema } from "./qa-sar.ts";
import {
  QA_SAR_BOOK_TEMPLATE_VERSION,
  QaSarBookRequirementPinSchema,
} from "./qa-sar-book.ts";
import { QaSarBookEvidenceRegisterViewSchema } from "./qa-sar-book-evidence.ts";
import { QaSarBookPart3SnapshotSchema } from "./qa-sar-book-part3-snapshot.ts";
import { QaSarBookReviewReadinessViewSchema } from "./qa-sar-book-review.ts";

export const QA_SAR_BOOK_RELEASE_TEMPLATE_VERSION =
  "aun-qa-v4-sar-book-v1-release-v1" as const;

export const QaSarBookDocumentModeSchema = z.enum(["working", "official", "released"]);

export const QaSarBookDocumentQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  mode: z.enum(["working", "official"]).default("working"),
});

export const FinalizeQaSarBookReleaseSchema = z.object({
  programmeId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(240).optional(),
});

export const QaSarBookReleaseQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
});

export const QaSarBookTocEntrySchema = z.object({
  id: z.string().trim().min(1),
  number: z.string().trim().min(1),
  title: z.string().trim().min(1),
  level: z.number().int().min(1).max(3),
  part: z.enum(["part1", "part2", "part3", "part4"]),
  requirementCode: z.string().trim().min(1).nullable(),
});

export const QaSarBookNarrativePinSchema = z.object({
  sectionKey: z.string().trim().min(1),
  revisionId: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
});

export const QaSarBookNarrativeSnapshotSchema = z.object({
  sectionKey: z.string().trim().min(1),
  title: z.string().trim().min(1),
  number: z.string().trim().min(1),
  revisionId: z.string().uuid().nullable(),
  revisionNumber: z.number().int().positive().nullable(),
  content: z.string(),
  plainText: z.string(),
});

export const QaSarBookRequirementSnapshotSchema = z.object({
  criterionCode: z.string().trim().min(1),
  criterionTitle: z.string().trim().min(1),
  requirementId: z.string().trim().min(1),
  requirementCode: z.string().trim().min(1),
  requirementTitle: z.string().trim().min(1),
  number: z.string().trim().min(1),
  workflowStatus: z.enum([
    "notStarted",
    "draft",
    "submitted",
    "changesRequested",
    "approved",
  ]),
  sourceKind: z.enum(["current", "submission", "approvedSubmission"]).nullable(),
  submissionId: z.string().trim().min(1).nullable(),
  submissionVersion: z.number().int().positive().nullable(),
  content: QaSarDocumentSchema.nullable(),
  plainText: z.string(),
  evidenceIds: z.array(z.string().trim().min(1)),
});

export const QaSarBookCriterionSnapshotSchema = z.object({
  criterionId: z.string().trim().min(1),
  criterionCode: z.string().trim().min(1),
  criterionTitle: z.string().trim().min(1),
  number: z.string().trim().min(1),
  requirements: z.array(QaSarBookRequirementSnapshotSchema),
});

export const QaSarBookReleaseSourceIndexSchema = z.object({
  narrativePins: z.array(QaSarBookNarrativePinSchema),
  requirementPins: z.array(QaSarBookRequirementPinSchema),
  evidenceIds: z.array(z.string().trim().min(1)),
  part3CapturedAt: z.string().datetime(),
});

export const QaSarBookReleaseMetaSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  title: z.string().trim().min(1),
  finalizedAt: z.string().datetime(),
  finalizedBy: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1),
  }),
});

export const QaSarBookDocumentSchema = z.object({
  schemaVersion: z.literal(QA_SAR_BOOK_RELEASE_TEMPLATE_VERSION),
  bookTemplateVersion: z.literal(QA_SAR_BOOK_TEMPLATE_VERSION),
  mode: QaSarBookDocumentModeSchema,
  generatedAt: z.string().datetime(),
  release: QaSarBookReleaseMetaSchema.nullable(),
  programme: z.object({
    id: z.string().trim().min(1),
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
  }),
  cycle: z.object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    reportingStart: z.string().datetime(),
    reportingEnd: z.string().datetime(),
  }),
  framework: z.object({
    id: z.string().trim().min(1),
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
  }),
  toc: z.array(QaSarBookTocEntrySchema),
  part1: z.object({
    title: z.string().trim().min(1),
    sections: z.array(QaSarBookNarrativeSnapshotSchema),
  }),
  part2: z.object({
    title: z.string().trim().min(1),
    criteria: z.array(QaSarBookCriterionSnapshotSchema),
  }),
  part3: z.object({
    title: z.string().trim().min(1),
    strengths: QaSarBookNarrativeSnapshotSchema,
    weaknesses: QaSarBookNarrativeSnapshotSchema,
    snapshot: QaSarBookPart3SnapshotSchema,
  }),
  part4: z.object({
    title: z.string().trim().min(1),
    glossary: QaSarBookNarrativeSnapshotSchema,
    evidenceRegister: QaSarBookEvidenceRegisterViewSchema,
    supportingEvidenceIds: z.array(z.string().trim().min(1)),
  }),
  readiness: QaSarBookReviewReadinessViewSchema,
  sourceIndex: QaSarBookReleaseSourceIndexSchema,
});

export const QaSarBookReleaseViewSchema = z.object({
  id: z.string().uuid(),
  programmeId: z.string().trim().min(1),
  cycleId: z.string().trim().min(1),
  version: z.number().int().positive(),
  title: z.string().trim().min(1),
  templateVersion: z.literal(QA_SAR_BOOK_RELEASE_TEMPLATE_VERSION),
  submissionIds: z.array(z.string().trim().min(1)),
  finalizedAt: z.string().datetime(),
  finalizedBy: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1),
  }),
  snapshot: QaSarBookDocumentSchema,
});

export type QaSarBookDocumentMode = z.infer<typeof QaSarBookDocumentModeSchema>;
export type QaSarBookTocEntry = z.infer<typeof QaSarBookTocEntrySchema>;
export type QaSarBookNarrativePin = z.infer<typeof QaSarBookNarrativePinSchema>;
export type QaSarBookNarrativeSnapshot = z.infer<typeof QaSarBookNarrativeSnapshotSchema>;
export type QaSarBookRequirementSnapshot = z.infer<typeof QaSarBookRequirementSnapshotSchema>;
export type QaSarBookCriterionSnapshot = z.infer<typeof QaSarBookCriterionSnapshotSchema>;
export type QaSarBookReleaseSourceIndex = z.infer<typeof QaSarBookReleaseSourceIndexSchema>;
export type QaSarBookReleaseMeta = z.infer<typeof QaSarBookReleaseMetaSchema>;
export type QaSarBookDocument = z.infer<typeof QaSarBookDocumentSchema>;
export type QaSarBookReleaseView = z.infer<typeof QaSarBookReleaseViewSchema>;
export type FinalizeQaSarBookReleaseInput = z.infer<typeof FinalizeQaSarBookReleaseSchema>;
