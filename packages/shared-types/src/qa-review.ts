import { z } from "zod";
import { QaEvidenceAnalysisStateSchema } from "./qa-analysis.ts";

export const QaAnalysisReviewDecisionSchema = z.enum([
  "confirmed",
  "rejected",
  "needsMoreEvidence",
]);

export const QaAnalysisCorrectionReasonCategorySchema = z.enum([
  "confirmation",
  "applicability",
  "evidence",
  "scope",
  "temporal",
  "authority",
  "relationship",
  "classification",
  "other",
]);

export const QaAnalysisCorrectionReasonCodeSchema = z.enum([
  "confirmed",
  "wrongApplicability",
  "missingEvidence",
  "irrelevantEvidence",
  "wrongScope",
  "staleEvidence",
  "weakAuthority",
  "wrongRelationship",
  "wrongClassification",
  "other",
]);

export const QaAnalysisCorrectedRelationshipSchema = z.object({
  fromCandidateKey: z.string().trim().min(1).max(500),
  toCandidateKey: z.string().trim().min(1).max(500),
  relation: z.enum(["supports", "derivedFrom", "reviewedBy", "resultsIn", "followedUpBy"]),
  state: z.enum(["satisfied", "gap", "ambiguous"]),
});

const categoryByCode = {
  confirmed: "confirmation",
  wrongApplicability: "applicability",
  missingEvidence: "evidence",
  irrelevantEvidence: "evidence",
  wrongScope: "scope",
  staleEvidence: "temporal",
  weakAuthority: "authority",
  wrongRelationship: "relationship",
  wrongClassification: "classification",
  other: "other",
} as const;

export function qaAnalysisCorrectionReasonCategory(
  code: z.infer<typeof QaAnalysisCorrectionReasonCodeSchema>,
): z.infer<typeof QaAnalysisCorrectionReasonCategorySchema> {
  return categoryByCode[code];
}

export const CreateQaAnalysisReviewSchema = z
  .object({
    programmeId: z.string().trim().min(1),
    decision: QaAnalysisReviewDecisionSchema,
    comment: z.string().trim().max(5000).default(""),
    correctedState: QaEvidenceAnalysisStateSchema.nullable().optional().default(null),
    reasonCode: QaAnalysisCorrectionReasonCodeSchema.optional(),
    correctedEvidenceCandidateKeys: z.array(z.string().trim().min(1).max(500)).max(500).default([]),
    correctedRelationships: z.array(QaAnalysisCorrectedRelationshipSchema).max(100).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "confirmed") {
      if (value.reasonCode && value.reasonCode !== "confirmed") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Confirmed reviews may only use the confirmed reason code",
          path: ["reasonCode"],
        });
      }
      if (
        value.correctedState !== null ||
        value.correctedEvidenceCandidateKeys.length > 0 ||
        value.correctedRelationships.length > 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Confirmed reviews cannot contain correction overrides",
          path: ["decision"],
        });
      }
      return;
    }

    if (value.comment.length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Corrections require a short reviewer rationale",
        path: ["comment"],
      });
    }
    if (!value.reasonCode || value.reasonCode === "confirmed") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Corrections require a structured disagreement reason code",
        path: ["reasonCode"],
      });
    }
  });

export const QaAnalysisReviewHistoryQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
});

export type QaAnalysisReviewDecision = z.infer<typeof QaAnalysisReviewDecisionSchema>;
export type QaAnalysisCorrectionReasonCategory = z.infer<typeof QaAnalysisCorrectionReasonCategorySchema>;
export type QaAnalysisCorrectionReasonCode = z.infer<typeof QaAnalysisCorrectionReasonCodeSchema>;
export type QaAnalysisCorrectedRelationship = z.infer<typeof QaAnalysisCorrectedRelationshipSchema>;
export type CreateQaAnalysisReviewInput = z.infer<typeof CreateQaAnalysisReviewSchema>;

export interface QaAnalysisReviewView {
  id: string;
  programmeId: string;
  analysisId: string;
  decision: QaAnalysisReviewDecision;
  comment: string;
  correctedState: z.infer<typeof QaEvidenceAnalysisStateSchema> | null;
  reasonCategory: QaAnalysisCorrectionReasonCategory;
  reasonCode: QaAnalysisCorrectionReasonCode;
  correctedEvidenceCandidateKeys: string[];
  correctedRelationships: QaAnalysisCorrectedRelationship[];
  reviewerId: string;
  reviewerName: string;
  createdAt: string;
}
