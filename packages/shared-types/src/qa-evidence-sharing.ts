import { z } from "zod";

export const QA_EVIDENCE_REDACTION_POLICY_VERSION = "qa-external-v1" as const;
export const QA_EVIDENCE_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export const QaEvidenceSnapshotSourceKindSchema = z.enum([
  "systemLink",
  "externalLink",
  "document",
]);

export const QaEvidenceSourceAuthoritySchema = z.enum([
  "officialInstitutionalRecord",
  "approvedDocument",
  "controlledInternalRecord",
  "contributorRecord",
  "externalDocument",
  "derivedAnalysis",
  "unknown",
]);

export const QaEvidenceSnapshotScopeSchema = z.object({
  programmeId: z.string().trim().min(1),
  requirementCodes: z.array(z.string()).default([]),
  expectationIds: z.array(z.string()).default([]),
  academicYear: z.string().nullable().optional(),
  term: z.string().nullable().optional(),
  courseId: z.string().nullable().optional(),
  courseSpecId: z.string().nullable().optional(),
  offeringId: z.string().nullable().optional(),
  cohortId: z.string().nullable().optional(),
  assessmentId: z.string().nullable().optional(),
});

export const QaEvidenceReportingPeriodSchema = z.object({
  label: z.string().default(""),
  start: z.string().nullable().default(null),
  end: z.string().nullable().default(null),
});

export const QaEvidenceSnapshotProvenanceSchema = z.object({
  sourceDomain: z.string().trim().min(1),
  sourceAuthority: QaEvidenceSourceAuthoritySchema,
  sourceEntityType: z.string().trim().min(1),
  sourceEntityId: z.string().trim().min(1),
  sourceVersion: z.string().default(""),
  approvalStatus: z.string().default(""),
  approvedAt: z.string().nullable().default(null),
  verifiedAt: z.string().nullable().default(null),
  sourceContentHash: z.string().nullable().default(null),
  redactionPolicyVersion: z.literal(QA_EVIDENCE_REDACTION_POLICY_VERSION),
});

export const CreateQaEvidenceSnapshotSchema = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().uuid(),
});

export const QaEvidenceSnapshotsQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  cycleId: z.string().uuid().optional(),
});

export const CreateQaEvidenceExternalReferenceSchema = z.object({
  programmeId: z.string().trim().min(1),
  expiresAt: z.coerce.date().nullable().optional().default(null),
});

export const QaEvidenceExternalReferenceQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
});

export type QaEvidenceSnapshotSourceKind = z.infer<typeof QaEvidenceSnapshotSourceKindSchema>;
export type QaEvidenceSourceAuthority = z.infer<typeof QaEvidenceSourceAuthoritySchema>;
export type QaEvidenceSnapshotScope = z.infer<typeof QaEvidenceSnapshotScopeSchema>;
export type QaEvidenceReportingPeriod = z.infer<typeof QaEvidenceReportingPeriodSchema>;
export type QaEvidenceSnapshotProvenance = z.infer<typeof QaEvidenceSnapshotProvenanceSchema>;
export type CreateQaEvidenceSnapshotInput = z.infer<typeof CreateQaEvidenceSnapshotSchema>;
export type QaEvidenceSnapshotsQuery = z.infer<typeof QaEvidenceSnapshotsQuerySchema>;
export type CreateQaEvidenceExternalReferenceInput = z.infer<typeof CreateQaEvidenceExternalReferenceSchema>;

export interface QaEvidenceSnapshotView {
  id: string;
  programmeId: string;
  cycleId: string;
  evidenceId: string;
  referenceCode: string;
  title: string;
  sourceKind: QaEvidenceSnapshotSourceKind;
  sourceDomain: string;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceVersion: string;
  snapshot: unknown;
  scope: QaEvidenceSnapshotScope;
  reportingPeriod: QaEvidenceReportingPeriod;
  provenance: QaEvidenceSnapshotProvenance;
  contentHash: string;
  redactionPolicyVersion: typeof QA_EVIDENCE_REDACTION_POLICY_VERSION;
  capturedBy: { id: string; name: string };
  capturedAt: string;
}

export interface QaEvidenceExternalReferenceView {
  id: string;
  snapshotId: string;
  referenceCode: string;
  active: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  lastViewedAt: string | null;
}

/** Returned only once when a secure external reference is created. */
export interface CreatedQaEvidenceExternalReferenceView extends QaEvidenceExternalReferenceView {
  accessToken: string;
  externalPath: string;
}

export interface QaExternalEvidenceView {
  referenceCode: string;
  title: string;
  programme: { id: string; code: string; name: string };
  qaContext: {
    cycleId: string;
    cycleTitle: string;
    requirementCodes: string[];
    expectationIds: string[];
  };
  sourceKind: QaEvidenceSnapshotSourceKind;
  scope: QaEvidenceSnapshotScope;
  reportingPeriod: QaEvidenceReportingPeriod;
  provenance: QaEvidenceSnapshotProvenance;
  evidence: unknown;
  contentHash: string;
  capturedAt: string;
}
