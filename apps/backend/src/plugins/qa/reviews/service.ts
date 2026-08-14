import type {
  CreateQaAnalysisReviewInput,
  QaAnalysisReviewView,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

const toDbDecision = {
  confirmed: "Confirmed",
  rejected: "Rejected",
  needsMoreEvidence: "NeedsMoreEvidence",
} as const;

const fromDbDecision = {
  Confirmed: "confirmed",
  Rejected: "rejected",
  NeedsMoreEvidence: "needsMoreEvidence",
} as const;

export class QaAnalysisReviewResourceNotFoundError extends Error {}
export class QaAnalysisReviewScopeMismatchError extends Error {}

function toView(review: {
  id: string;
  programmeId: string;
  analysisId: string;
  reviewerId: string;
  decision: keyof typeof fromDbDecision;
  comment: string;
  createdAt: Date;
  reviewer: { name: string };
}): QaAnalysisReviewView {
  return {
    id: review.id,
    programmeId: review.programmeId,
    analysisId: review.analysisId,
    reviewerId: review.reviewerId,
    reviewerName: review.reviewer.name,
    decision: fromDbDecision[review.decision],
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
  };
}

export async function createQaAnalysisReview(
  analysisId: string,
  input: CreateQaAnalysisReviewInput,
  reviewerId: string,
): Promise<QaAnalysisReviewView> {
  const analysis = await prisma.qaEvidenceAnalysis.findUnique({
    where: { id: analysisId },
    select: { id: true, programmeId: true },
  });
  if (!analysis) {
    throw new QaAnalysisReviewResourceNotFoundError("QA evidence analysis not found");
  }
  if (analysis.programmeId !== input.programmeId) {
    throw new QaAnalysisReviewScopeMismatchError(
      "QA analysis review does not belong to this programme",
    );
  }

  const created = await prisma.qaEvidenceAnalysisReview.create({
    data: {
      programmeId: input.programmeId,
      analysisId,
      reviewerId,
      decision: toDbDecision[input.decision],
      comment: input.comment,
    },
    include: { reviewer: { select: { name: true } } },
  });
  return toView(created);
}

export async function listQaAnalysisReviews(
  programmeId: string,
  cycleId: string,
): Promise<QaAnalysisReviewView[]> {
  const cycle = await prisma.qaAssessmentCycle.findUnique({
    where: { id: cycleId },
    select: { programmeId: true },
  });
  if (!cycle) {
    throw new QaAnalysisReviewResourceNotFoundError("QA assessment cycle not found");
  }
  if (cycle.programmeId !== programmeId) {
    throw new QaAnalysisReviewScopeMismatchError(
      "QA analysis review history does not belong to this programme",
    );
  }

  const reviews = await prisma.qaEvidenceAnalysisReview.findMany({
    where: {
      programmeId,
      analysis: { cycleId },
    },
    orderBy: { createdAt: "desc" },
    include: { reviewer: { select: { name: true } } },
  });
  return reviews.map(toView);
}
