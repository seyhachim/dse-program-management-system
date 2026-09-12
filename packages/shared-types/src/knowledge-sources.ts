import { z } from "zod";

export const KnowledgeDomainSchema = z.enum([
  "AUN_QA",
  "CAMBODIA_OBE",
  "RUPP",
  "FACULTY_ENGINEERING",
  "DSE",
]);
export type KnowledgeDomain = z.infer<typeof KnowledgeDomainSchema>;

export const KnowledgeSourceTypeSchema = z.enum([
  "OFFICIAL_FRAMEWORK",
  "REGULATION_POLICY",
  "GUIDELINE_PLAYBOOK",
  "OFFICIAL_STANDARD",
  "UNIVERSITY_POLICY",
  "FACULTY_POLICY_PROCEDURE",
  "APPROVED_PROGRAMME_SPECIFICATION",
  "APPROVED_CURRICULUM",
  "APPROVED_ACADEMIC_DOCUMENT",
  "OFFICIAL_WEBPAGE",
  "TRUSTED_EXTERNAL_REFERENCE",
  "WORKING_REFERENCE",
]);
export type KnowledgeSourceType = z.infer<typeof KnowledgeSourceTypeSchema>;

export const KnowledgeTrustCategorySchema = z.enum([
  "AUTHORITATIVE",
  "INSTITUTIONAL_OFFICIAL",
  "TRUSTED_REFERENCE",
  "WORKING_REFERENCE",
  "UNVERIFIED",
]);
export type KnowledgeTrustCategory = z.infer<typeof KnowledgeTrustCategorySchema>;

export const VerifiedKnowledgeTrustCategorySchema = z.enum([
  "AUTHORITATIVE",
  "INSTITUTIONAL_OFFICIAL",
  "TRUSTED_REFERENCE",
  "WORKING_REFERENCE",
]);

export const KnowledgeAccessClassificationSchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "RESTRICTED",
]);
export type KnowledgeAccessClassification = z.infer<typeof KnowledgeAccessClassificationSchema>;

export const KnowledgeSourceVersionStatusSchema = z.enum([
  "CANDIDATE",
  "CURRENT",
  "SUPERSEDED",
  "ARCHIVED",
]);
export type KnowledgeSourceVersionStatus = z.infer<typeof KnowledgeSourceVersionStatusSchema>;

export const KnowledgeSourceAuditActionSchema = z.enum([
  "SOURCE_CREATED",
  "VERSION_CREATED",
  "VERSION_VERIFIED",
  "VERSION_SUPERSEDED",
  "VERSION_ARCHIVED",
  "SOURCE_ARCHIVED",
  "ACCESS_CLASSIFICATION_CHANGED",
]);
export type KnowledgeSourceAuditAction = z.infer<typeof KnowledgeSourceAuditActionSchema>;

const OptionalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .nullable()
  .optional();

export const KnowledgeSourceVersionInputSchema = z.object({
  versionLabel: z.string().trim().min(1).max(100),
  publicationDate: OptionalDateSchema,
  effectiveDate: OptionalDateSchema,
  reviewDate: OptionalDateSchema,
  officialUrl: z.string().trim().url().max(2048).nullable().optional(),
  storedFileRef: z.string().trim().max(2048).nullable().optional(),
  language: z.string().trim().min(2).max(32).default("en"),
  checksum: z.string().trim().max(256).nullable().optional(),
});
export type KnowledgeSourceVersionInput = z.infer<typeof KnowledgeSourceVersionInputSchema>;

export const CreateKnowledgeSourceSchema = z.object({
  programmeId: z.string().trim().min(1),
  domain: KnowledgeDomainSchema,
  title: z.string().trim().min(2).max(500),
  shortTitle: z.string().trim().max(160).nullable().optional(),
  issuingOrganisation: z.string().trim().min(2).max(300),
  sourceType: KnowledgeSourceTypeSchema,
  accessClassification: KnowledgeAccessClassificationSchema.default("INTERNAL"),
  jurisdictionScope: z.string().trim().max(500).nullable().optional(),
  initialVersion: KnowledgeSourceVersionInputSchema,
});
export type CreateKnowledgeSourceInput = z.infer<typeof CreateKnowledgeSourceSchema>;

export const CreateKnowledgeSourceVersionSchema = KnowledgeSourceVersionInputSchema.extend({
  programmeId: z.string().trim().min(1),
});
export type CreateKnowledgeSourceVersionInput = z.infer<typeof CreateKnowledgeSourceVersionSchema>;

export const VerifyKnowledgeSourceVersionSchema = z.object({
  programmeId: z.string().trim().min(1),
  trustCategory: VerifiedKnowledgeTrustCategorySchema,
  verificationNote: z.string().trim().min(3).max(2000),
});
export type VerifyKnowledgeSourceVersionInput = z.infer<typeof VerifyKnowledgeSourceVersionSchema>;

export const ArchiveKnowledgeSourceSchema = z.object({
  programmeId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(1000),
});
export type ArchiveKnowledgeSourceInput = z.infer<typeof ArchiveKnowledgeSourceSchema>;

export const KnowledgeSourceListQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  domain: KnowledgeDomainSchema.optional(),
  trustCategory: KnowledgeTrustCategorySchema.optional(),
  accessClassification: KnowledgeAccessClassificationSchema.optional(),
  status: KnowledgeSourceVersionStatusSchema.optional(),
  query: z.string().trim().max(200).optional(),
});
export type KnowledgeSourceListQuery = z.infer<typeof KnowledgeSourceListQuerySchema>;

export const KnowledgeSourceContextSchema = z.object({
  programmeId: z.string().trim().min(1),
});

export type KnowledgeSourceVersionView = {
  id: string;
  sourceId: string;
  versionLabel: string;
  publicationDate: string | null;
  effectiveDate: string | null;
  reviewDate: string | null;
  officialUrl: string | null;
  storedFileRef: string | null;
  language: string;
  checksum: string | null;
  status: KnowledgeSourceVersionStatus;
  supersedesVersionId: string | null;
  createdById: string;
  createdAt: string;
  verifiedById: string | null;
  verifiedAt: string | null;
  verificationNote: string;
};

export type KnowledgeSourceSummaryView = {
  id: string;
  programmeId: string;
  domain: KnowledgeDomain;
  title: string;
  shortTitle: string | null;
  issuingOrganisation: string;
  sourceType: KnowledgeSourceType;
  trustCategory: KnowledgeTrustCategory;
  accessClassification: KnowledgeAccessClassification;
  jurisdictionScope: string | null;
  active: boolean;
  createdById: string;
  createdAt: string;
  currentVersion: KnowledgeSourceVersionView | null;
  versionCount: number;
};

export type KnowledgeSourceAuditEventView = {
  id: string;
  sourceId: string;
  versionId: string | null;
  action: KnowledgeSourceAuditAction;
  actorId: string;
  reason: string;
  context: Record<string, unknown>;
  createdAt: string;
};

export type KnowledgeSourceDetailView = KnowledgeSourceSummaryView & {
  versions: KnowledgeSourceVersionView[];
  audit: KnowledgeSourceAuditEventView[];
};
