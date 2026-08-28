import { z } from "zod";

export const QaSarBookAppendixGroupSchema = z.enum([
  "programme",
  "curriculum",
  "teachingLearning",
  "assessment",
  "staff",
  "studentSupport",
  "facilities",
  "outcomes",
  "governance",
  "other",
]);

export const QaSarBookEvidenceRegisterQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  mode: z.enum(["working", "official"]).default("working"),
});

export const QaSarBookTerminologySchema = z.object({
  evidenceCitationLabel: z.string().trim().min(1).max(40).default("Exhibit"),
  evidenceRegisterTitle: z.string().trim().min(1).max(120).default("List of Exhibits"),
  appendixLabel: z.string().trim().min(1).max(40).default("Appendix"),
  requirementLabel: z.string().trim().min(1).max(40).default("Requirement"),
  criterionLabel: z.string().trim().min(1).max(40).default("Criterion"),
});

export const UpdateQaSarBookTerminologySchema = z.object({
  programmeId: z.string().trim().min(1),
  terminology: QaSarBookTerminologySchema,
});

export const QaSarBookEvidenceUsageSchema = z.object({
  part: z.enum(["part1", "part2", "part3", "part4"]),
  sectionKey: z.string().trim().min(1),
  sectionTitle: z.string().trim().min(1),
  requirementCode: z.string().trim().min(1).nullable(),
  submissionId: z.string().uuid().nullable(),
  revisionId: z.string().uuid().nullable(),
});

export const QaSarBookEvidenceRegisterItemSchema = z.object({
  evidenceId: z.string().uuid(),
  title: z.string().trim().min(1),
  kind: z.enum(["systemLink", "externalLink", "document"]),
  status: z.enum(["draft", "ready", "reviewed"]),
  reportingPeriod: z.string(),
  sourceRef: z.string(),
  sourceUrl: z.string().url().nullable(),
  appendixGroup: QaSarBookAppendixGroupSchema,
  number: z.string().trim().min(1),
  citationLabel: z.string().trim().min(1),
  citationText: z.string().trim().min(1),
  usages: z.array(QaSarBookEvidenceUsageSchema).min(1),
});

export const QaSarBookEvidenceIssueSchema = z.object({
  type: z.enum(["missingEvidence", "draftEvidence", "invalidReference"]),
  evidenceId: z.string().trim().min(1),
  sectionKey: z.string().trim().min(1),
  requirementCode: z.string().trim().min(1).nullable(),
  message: z.string().trim().min(1),
});

export const QaSarBookEvidenceRegisterViewSchema = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().trim().min(1),
  terminology: QaSarBookTerminologySchema,
  items: z.array(QaSarBookEvidenceRegisterItemSchema),
  issues: z.array(QaSarBookEvidenceIssueSchema),
  generatedAt: z.string().datetime(),
});

export const AddQaSarBookSectionEvidenceReferenceSchema = z.object({
  programmeId: z.string().trim().min(1),
  evidenceId: z.string().uuid(),
  revisionId: z.string().uuid(),
  appendixGroup: QaSarBookAppendixGroupSchema.default("other"),
});

export const UpdateQaSarBookEvidencePresentationSchema = z.object({
  programmeId: z.string().trim().min(1),
  appendixGroup: QaSarBookAppendixGroupSchema,
});

export const QaSarBookSectionEvidenceReferenceViewSchema = z.object({
  id: z.string().uuid(),
  programmeId: z.string().trim().min(1),
  cycleId: z.string().trim().min(1),
  sectionKey: z.string().trim().min(1),
  revisionId: z.string().uuid(),
  evidenceId: z.string().uuid(),
  evidenceTitle: z.string().trim().min(1),
  appendixGroup: QaSarBookAppendixGroupSchema,
  createdById: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export type QaSarBookAppendixGroup = z.infer<typeof QaSarBookAppendixGroupSchema>;
export type QaSarBookEvidenceRegisterQuery = z.infer<typeof QaSarBookEvidenceRegisterQuerySchema>;
export type QaSarBookTerminology = z.infer<typeof QaSarBookTerminologySchema>;
export type UpdateQaSarBookTerminologyInput = z.infer<typeof UpdateQaSarBookTerminologySchema>;
export type QaSarBookEvidenceUsage = z.infer<typeof QaSarBookEvidenceUsageSchema>;
export type QaSarBookEvidenceRegisterItem = z.infer<typeof QaSarBookEvidenceRegisterItemSchema>;
export type QaSarBookEvidenceIssue = z.infer<typeof QaSarBookEvidenceIssueSchema>;
export type QaSarBookEvidenceRegisterView = z.infer<typeof QaSarBookEvidenceRegisterViewSchema>;
export type AddQaSarBookSectionEvidenceReferenceInput = z.infer<typeof AddQaSarBookSectionEvidenceReferenceSchema>;
export type UpdateQaSarBookEvidencePresentationInput = z.infer<typeof UpdateQaSarBookEvidencePresentationSchema>;
export type QaSarBookSectionEvidenceReferenceView = z.infer<typeof QaSarBookSectionEvidenceReferenceViewSchema>;

export const DEFAULT_QA_SAR_BOOK_TERMINOLOGY: QaSarBookTerminology = {
  evidenceCitationLabel: "Exhibit",
  evidenceRegisterTitle: "List of Exhibits",
  appendixLabel: "Appendix",
  requirementLabel: "Requirement",
  criterionLabel: "Criterion",
};
