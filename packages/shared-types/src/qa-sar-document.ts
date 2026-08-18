import { z } from "zod";
import type { QaSarDocument } from "./qa-sar.ts";

export const QaSarDocumentModeSchema = z.enum(["working", "official"]);
export const QaSarDocumentQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  mode: QaSarDocumentModeSchema.default("working"),
});
export const FinalizeQaSarDocumentSchema = z.object({
  programmeId: z.string().trim().min(1),
  title: z.string().trim().min(3).max(200).optional(),
});
export const QaSarReleaseQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
});

export type QaSarDocumentMode = z.infer<typeof QaSarDocumentModeSchema>;

export interface QaSarDocumentSectionView {
  requirementCode: string;
  requirementTitle: string;
  status: "missing" | "draft" | "underReview" | "changesRequested" | "approved";
  submissionId: string | null;
  submissionVersion: number | null;
  content: QaSarDocument | null;
  plainText: string;
  evidenceIds: string[];
}

export interface QaSarDocumentCriterionView {
  code: string;
  title: string;
  sections: QaSarDocumentSectionView[];
}

export interface QaSarEvidenceRegisterItemView {
  evidenceId: string;
  title: string;
  kind: "systemLink" | "externalLink" | "document";
  reportingPeriod: string;
  sourceRef: string;
  sourceUrl: string | null;
  requirementCodes: string[];
  /** Immutable evidence snapshot pinned for audit/external verification when available. */
  snapshotId?: string | null;
  referenceCode?: string | null;
  externalUrl?: string | null;
  capturedAt?: string | null;
}

export interface QaSarDocumentModelView {
  programmeId: string;
  programmeCode: string;
  programmeName: string;
  cycleId: string;
  cycleTitle: string;
  reportingStart: string;
  reportingEnd: string;
  mode: QaSarDocumentMode;
  generatedAt: string;
  totals: {
    requiredSections: number;
    includedSections: number;
    approvedSections: number;
    missingSections: number;
  };
  criteria: QaSarDocumentCriterionView[];
  evidenceRegister: QaSarEvidenceRegisterItemView[];
}

export interface QaSarReleaseView {
  id: string;
  programmeId: string;
  cycleId: string;
  version: number;
  title: string;
  templateVersion: string;
  snapshot: QaSarDocumentModelView;
  submissionIds: string[];
  finalizedBy: { id: string; name: string };
  finalizedAt: string;
}