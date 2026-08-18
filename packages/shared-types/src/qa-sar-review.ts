import { z } from "zod";
import type { QaSarDocument, QaSarSectionStatus } from "./qa-sar.ts";

export const QaSarReviewDecisionSchema = z.enum([
  "approved",
  "changesRequested",
  "moreEvidenceRequested",
]);

export const CreateQaSarReviewSchema = z
  .object({
    programmeId: z.string().trim().min(1),
    decision: QaSarReviewDecisionSchema,
    comment: z.string().trim().max(5000).default(""),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== "approved" && !value.comment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Explain what the contributor needs to change or what evidence is needed",
        path: ["comment"],
      });
    }
  });

export const QaSarReviewQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
});

export type QaSarReviewDecision = z.infer<typeof QaSarReviewDecisionSchema>;
export type CreateQaSarReviewInput = z.infer<typeof CreateQaSarReviewSchema>;

export interface QaSarReviewView {
  id: string;
  decision: QaSarReviewDecision;
  comment: string;
  reviewer: { id: string; name: string };
  createdAt: string;
}

export interface QaSarSubmissionView {
  id: string;
  programmeId: string;
  cycleId: string;
  sectionId: string;
  criterionCode: string;
  criterionTitle: string;
  requirementCode: string;
  requirementTitle: string;
  version: number;
  content: QaSarDocument;
  plainText: string;
  readiness: {
    practiceDescribed: boolean;
    resultsAnalysed: boolean;
    improvementExplained: boolean;
  };
  evidenceIds: string[];
  submittedBy: { id: string; name: string };
  submittedAt: string;
  reviews: QaSarReviewView[];
}

export interface QaSarReviewQueueView {
  programmeId: string;
  cycleId: string | null;
  submissions: QaSarSubmissionView[];
}

export interface QaSarProgressItemView {
  requirementCode: string;
  status: QaSarSectionStatus;
  latestSubmissionVersion: number | null;
  latestReviewDecision: QaSarReviewDecision | null;
}
