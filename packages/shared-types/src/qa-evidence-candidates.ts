import { z } from "zod";
import { QaEvidenceSourceDomainSchema } from "./qa-knowledge.ts";

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
  attributes: Record<string, QaEvidenceAttributeValue>;
}

export interface QaEvidenceCandidateResultView {
  programmeId: string;
  expectedEvidenceId: string;
  evidenceType: string;
  sourceDomain: z.infer<typeof QaEvidenceSourceDomainSchema>;
  status: QaEvidenceRetrievalStatus;
  reason: string;
  candidates: QaEvidenceCandidateView[];
}

export const QaEvidenceCandidatesQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
  expectedEvidenceId: z.string().trim().min(1).max(200),
});

/**
 * Evidence types that #186 can retrieve deterministically from current DSE-PMS
 * tables. Types not listed here remain explicit unsupported sources rather than
 * being interpreted as missing evidence.
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

export const QA_EXPLICITLY_UNSUPPORTED_EVIDENCE_TYPES = [
  "published-outcomes",
  "clo-achievement",
  "programme-outcome-analysis",
  "curriculum-mapping",
  "teaching-review-records",
  "rubrics",
  "plo-synthesis",
  "supporting-cv",
] as const;
