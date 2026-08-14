import { z } from "zod";

export const QaAnalysisReviewDecisionSchema = z.enum([
  "confirmed",
  "rejected",
  "needsMoreEvidence",
]);

export const CreateQaAnalysisReviewSchema = z
  .object({
    programmeId: z.string().trim().min(1),
    decision: QaAnalysisReviewDecisionSchema,
    comment: z.string().trim().max(5000).default(""),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== "confirmed" && value.comment.length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rejected or needs-more-evidence reviews require a short explanation",
        path: ["comment"],
      });
    }
  });

export const QaAnalysisReviewHistoryQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
});

export type QaAnalysisReviewDecision = z.infer<typeof QaAnalysisReviewDecisionSchema>;
export type CreateQaAnalysisReviewInput = z.infer<typeof CreateQaAnalysisReviewSchema>;

export interface QaAnalysisReviewView {
  id: string;
  programmeId: string;
  analysisId: string;
  decision: QaAnalysisReviewDecision;
  comment: string;
  reviewerId: string;
  reviewerName: string;
  createdAt: string;
}
