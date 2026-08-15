import { z } from "zod";
import type { QaCycleView } from "./qa.ts";
import type { QaRequirementAssignmentView } from "./qa-assignments.ts";

export const QaEvidenceReadinessSchema = z.enum(["none", "collected", "reviewed"]);
export const QaWritingReadinessSchema = z.enum(["notStarted", "drafting"]);
export const QaSarReviewStatusSchema = z.enum(["notSubmitted"]);

export type QaEvidenceReadiness = z.infer<typeof QaEvidenceReadinessSchema>;
export type QaWritingReadiness = z.infer<typeof QaWritingReadinessSchema>;
export type QaSarReviewStatus = z.infer<typeof QaSarReviewStatusSchema>;

export interface QaContributorWorkItem {
  assignment: QaRequirementAssignmentView;
  evidence: {
    count: number;
    reviewedCount: number;
    readiness: QaEvidenceReadiness;
  };
  writingStatus: QaWritingReadiness;
  reviewStatus: QaSarReviewStatus;
}

export interface QaContributorWorkspaceView {
  programmeId: string;
  selectedCycle: QaCycleView | null;
  work: QaContributorWorkItem[];
}
