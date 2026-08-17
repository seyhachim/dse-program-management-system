import { z } from "zod";
import { QaEvidenceSourceDomainSchema } from "./qa-knowledge.ts";
import type { QaEvidenceProvenance, QaEvidenceScope } from "./qa-evidence-semantics.ts";

export const QaEvidenceRetrievalStatusSchema = z.enum(["supported", "unsupported"]);
export type QaEvidenceRetrievalStatus = z.infer<typeof QaEvidenceRetrievalStatusSchema>;

export type QaEvidenceAttributeValue = string | number | boolean | null;

export interface QaEvidenceCandidateView {
  key: string;
  evidenceType: string;
  sourceDomain: z.infer<typeof QaEvidenceSourceDomainSchema>;
  title: string;
  summary: string;
  entityType: string;
  entityId: string;
  route: string | null;
  reportingDate: string | null;
  /** Normalized machine-readable scope. Optional while legacy adapters migrate. */
  scope?: QaEvidenceScope;
  /** Source authority/provenance is distinct from the evidence source domain. */
  provenance?: QaEvidenceProvenance;
  /** Comparable reporting period key, e.g. academic year/cohort period. */
  periodKey?: string | null;
  attributes: Record<string, QaEvidenceAttributeValue>;
}

export interface QaEvidenceCandidateResultView {
  programmeId: string;
  expectedEvidenceId: string;
  evidenceType: string;
  sourceDomain: z.infer<typeof QaEvidenceSourceDomainSchema>;
  status: QaEvidenceRetrievalStatus;
  reason: string;
  /**
   * Concrete target scope when the caller is evaluating one known course,
   * course-spec version, offering, cohort, assessment, term, or population.
   * Programme-wide retrievals may omit it; required dimensions are then checked
   * for presence without inventing a target value.
   */
  expectedScope?: QaEvidenceScope;
  candidates: QaEvidenceCandidateView[];
}

export const QaEvidenceCandidatesQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  expectedEvidenceId: z.string().trim().min(1).max(200),
  topK: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * Evidence types #186 can retrieve deterministically from current DSE-PMS tables.
 */
export const QA_STRUCTURED_EVIDENCE_TYPES = [
  "programme-outcomes",
  "programme-profile",
  "clo-plo-mappings",
  "approved-course-specs",
  "approved-course-specifications",
  "programme-structure",
  "approval-history",
  "clo-teaching-alignment",
  "clo-assessment-alignment",
  "weekly-alignment",
  "course-clo-plo-coverage",
  "educational-philosophy",
  "course-teaching-philosophy",
  "active-learning-strategies",
  "weekly-student-activities",
  "course-spec-review-history",
  "assessment-plan",
  "clo-assessment-methods",
  "published-results",
  "feedback-plan",
  "published-feedback",
  "lecturer-assignments",
  "weekly-workload",
  "staff-profile",
  "teaching-assignments",
] as const;

/** Evidence types #189 can retrieve semantically from programme QA documents. */
export const QA_SEMANTIC_EVIDENCE_TYPES = [
  "published-outcomes",
  "programme-outcome-analysis",
  "curriculum-mapping",
  "teaching-review-records",
  "plo-synthesis",
  "supporting-cv",
] as const;

/** Evidence types whose source model is still not safe/available after #189. */
export const QA_EXPLICITLY_UNSUPPORTED_EVIDENCE_TYPES = [
  "clo-achievement",
  "rubrics",
] as const;
