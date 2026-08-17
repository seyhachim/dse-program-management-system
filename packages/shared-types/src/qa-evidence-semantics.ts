import { z } from "zod";

export const QaApplicabilityStateSchema = z.enum([
  "applicable",
  "notApplicable",
  "uncertain",
]);
export type QaApplicabilityState = z.infer<typeof QaApplicabilityStateSchema>;

export const QaApplicabilityRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("always") }),
  z.object({
    kind: z.literal("cohortMaturity"),
    minimumElapsedYears: z.number().int().min(0).max(20),
  }),
]);
export type QaApplicabilityRule = z.infer<typeof QaApplicabilityRuleSchema>;

export const QaEvidenceScopeDimensionSchema = z.enum([
  "programme",
  "academicYear",
  "term",
  "course",
  "courseSpecVersion",
  "offering",
  "cohort",
  "assessment",
  "population",
]);
export type QaEvidenceScopeDimension = z.infer<typeof QaEvidenceScopeDimensionSchema>;

export const QaEvidenceScopeSchema = z.object({
  programmeId: z.string().trim().min(1).optional(),
  academicYear: z.string().trim().min(1).optional(),
  term: z.string().trim().min(1).optional(),
  courseId: z.string().trim().min(1).optional(),
  courseSpecVersionId: z.string().trim().min(1).optional(),
  offeringId: z.string().trim().min(1).optional(),
  cohortId: z.string().trim().min(1).optional(),
  assessmentId: z.string().trim().min(1).optional(),
  population: z.string().trim().min(1).optional(),
});
export type QaEvidenceScope = z.infer<typeof QaEvidenceScopeSchema>;

export const QaEvidenceScopeRequirementSchema = z.object({
  requiredDimensions: z.array(QaEvidenceScopeDimensionSchema).max(9).default([]),
});
export type QaEvidenceScopeRequirement = z.infer<typeof QaEvidenceScopeRequirementSchema>;

export const QaScopeMatchSchema = z.enum(["exact", "partial", "mismatch", "unknown"]);
export type QaScopeMatch = z.infer<typeof QaScopeMatchSchema>;

export const QaTemporalRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("withinCycle") }),
  z.object({ kind: z.literal("pointInTime") }),
  z.object({
    kind: z.literal("recent"),
    maximumAgeDays: z.number().int().min(1).max(3650),
  }),
  z.object({
    kind: z.literal("multiPeriod"),
    minimumPeriods: z.number().int().min(2).max(50),
  }),
  z.object({
    kind: z.literal("longitudinal"),
    minimumPeriods: z.number().int().min(2).max(50),
  }),
]);
export type QaTemporalRule = z.infer<typeof QaTemporalRuleSchema>;

export const QaTemporalMatchSchema = z.enum([
  "current",
  "historicalRelevant",
  "stale",
  "future",
  "insufficientHistory",
  "unknown",
]);
export type QaTemporalMatch = z.infer<typeof QaTemporalMatchSchema>;

export const QA_SOURCE_AUTHORITY_ORDER = [
  "unknown",
  "derivedAnalysis",
  "uploadedExternalDocument",
  "contributorRecord",
  "controlledInternalRecord",
  "approvedDocument",
  "officialInstitutionalRecord",
] as const;

export const QaSourceAuthoritySchema = z.enum(QA_SOURCE_AUTHORITY_ORDER);
export type QaSourceAuthority = z.infer<typeof QaSourceAuthoritySchema>;

export const QaEvidenceProvenanceSchema = z.object({
  authority: QaSourceAuthoritySchema.default("unknown"),
  ownerUnit: z.string().trim().max(200).nullable().optional().default(null),
  version: z.string().trim().max(200).nullable().optional().default(null),
  approvalStatus: z.string().trim().max(100).nullable().optional().default(null),
  sourceUri: z.string().trim().max(2000).nullable().optional().default(null),
});
export type QaEvidenceProvenance = z.infer<typeof QaEvidenceProvenanceSchema>;

export const QaSourceAuthorityRequirementSchema = z.object({
  minimumAuthority: QaSourceAuthoritySchema.default("unknown"),
  acceptableAuthorities: z.array(QaSourceAuthoritySchema).max(QA_SOURCE_AUTHORITY_ORDER.length).optional(),
});
export type QaSourceAuthorityRequirement = z.infer<typeof QaSourceAuthorityRequirementSchema>;

/** Machine-operable expectation semantics introduced by #296-#298. */
export const QaQualityExpectationSemanticsSchema = z.object({
  applicabilityRule: QaApplicabilityRuleSchema.default({ kind: "always" }),
  scopeRequirement: QaEvidenceScopeRequirementSchema.default({ requiredDimensions: [] }),
  temporalRule: QaTemporalRuleSchema.default({ kind: "withinCycle" }),
});
export type QaQualityExpectationSemantics = z.infer<typeof QaQualityExpectationSemanticsSchema>;

/** Machine-operable evidence semantics introduced by #297-#299. */
export const QaExpectedEvidenceSemanticsSchema = z.object({
  scopeRequirement: QaEvidenceScopeRequirementSchema.default({ requiredDimensions: [] }),
  temporalRule: QaTemporalRuleSchema.default({ kind: "withinCycle" }),
  authorityRequirement: QaSourceAuthorityRequirementSchema.default({ minimumAuthority: "unknown" }),
});
export type QaExpectedEvidenceSemantics = z.infer<typeof QaExpectedEvidenceSemanticsSchema>;

export const QaEvidenceSemanticsSnapshotSchema = z.object({
  applicability: QaApplicabilityStateSchema,
  applicabilityReason: z.string().trim().max(2000).default(""),
  scopeMatch: QaScopeMatchSchema.default("unknown"),
  temporalMatch: QaTemporalMatchSchema.default("unknown"),
  provenance: QaEvidenceProvenanceSchema,
});
export type QaEvidenceSemanticsSnapshot = z.infer<typeof QaEvidenceSemanticsSnapshotSchema>;
