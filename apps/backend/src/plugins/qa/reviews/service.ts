import {
  QaAnalysisCorrectedRelationshipSchema,
  QaAnalysisCorrectionReasonCategorySchema,
  QaAnalysisCorrectionReasonCodeSchema,
  QaEvidenceAnalysisStateSchema,
  qaAnalysisCorrectionReasonCategory,
  type CreateQaAnalysisReviewInput,
  type QaAnalysisReviewView,
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

const toDbState = {
  evidenceIdentified: "EvidenceIdentified",
  potentialEvidenceGap: "PotentialEvidenceGap",
  expertReviewRequired: "ExpertReviewRequired",
} as const;

const fromDbState = {
  EvidenceIdentified: "evidenceIdentified",
  PotentialEvidenceGap: "potentialEvidenceGap",
  ExpertReviewRequired: "expertReviewRequired",
} as const;

export class QaAnalysisReviewResourceNotFoundError extends Error {}
export class QaAnalysisReviewScopeMismatchError extends Error {}

type CorrectionRow = {
  id: string;
  correctedState: keyof typeof fromDbState | null;
  reasonCategory: string;
  reasonCode: string;
  correctedEvidenceCandidateKeys: string[];
  correctedRelationships: unknown;
};

type ReviewRow = {
  id: string;
  programmeId: string;
  analysisId: string;
  reviewerId: string;
  decision: keyof typeof fromDbDecision;
  comment: string;
  createdAt: Date;
  reviewer: { name: string };
};

function toView(review: ReviewRow, correction?: CorrectionRow): QaAnalysisReviewView {
  return {
    id: review.id,
    programmeId: review.programmeId,
    analysisId: review.analysisId,
    reviewerId: review.reviewerId,
    reviewerName: review.reviewer.name,
    decision: fromDbDecision[review.decision],
    comment: review.comment,
    correctedState: correction?.correctedState
      ? QaEvidenceAnalysisStateSchema.parse(fromDbState[correction.correctedState])
      : null,
    reasonCategory: QaAnalysisCorrectionReasonCategorySchema.parse(
      correction?.reasonCategory ?? "confirmation",
    ),
    reasonCode: QaAnalysisCorrectionReasonCodeSchema.parse(
      correction?.reasonCode ?? "confirmed",
    ),
    correctedEvidenceCandidateKeys: correction?.correctedEvidenceCandidateKeys ?? [],
    correctedRelationships: QaAnalysisCorrectedRelationshipSchema.array().parse(
      correction?.correctedRelationships ?? [],
    ),
    createdAt: review.createdAt.toISOString(),
  };
}

async function loadCorrectionRows(ids: string[]): Promise<Map<string, CorrectionRow>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw<CorrectionRow[]>`
    SELECT id, "correctedState", "reasonCategory", "reasonCode",
           "correctedEvidenceCandidateKeys", "correctedRelationships"
    FROM "QaEvidenceAnalysisReview"
    WHERE id = ANY(${ids}::text[])
  `;
  return new Map(rows.map((row) => [row.id, row]));
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

  const id = crypto.randomUUID();
  const reasonCode = input.reasonCode ?? "confirmed";
  const reasonCategory = qaAnalysisCorrectionReasonCategory(reasonCode);
  const correctedState = input.correctedState
    ? toDbState[input.correctedState]
    : null;

  await prisma.$executeRaw`
    INSERT INTO "QaEvidenceAnalysisReview" (
      id, "programmeId", "analysisId", "reviewerId", decision, comment,
      "correctedState", "reasonCategory", "reasonCode",
      "correctedEvidenceCandidateKeys", "correctedRelationships", "createdAt"
    ) VALUES (
      ${id}, ${input.programmeId}, ${analysisId}, ${reviewerId},
      ${toDbDecision[input.decision]}::"QaAnalysisReviewDecision", ${input.comment},
      ${correctedState}::"QaEvidenceAnalysisState", ${reasonCategory}, ${reasonCode},
      ${input.correctedEvidenceCandidateKeys}::text[],
      CAST(${JSON.stringify(input.correctedRelationships)} AS jsonb), NOW()
    )
  `;

  const created = await prisma.qaEvidenceAnalysisReview.findUnique({
    where: { id },
    include: { reviewer: { select: { name: true } } },
  });
  if (!created) {
    throw new QaAnalysisReviewResourceNotFoundError("Created QA analysis review could not be reloaded");
  }
  const corrections = await loadCorrectionRows([id]);
  return toView(created, corrections.get(id));
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
  const corrections = await loadCorrectionRows(reviews.map((review) => review.id));
  return reviews.map((review) => toView(review, corrections.get(review.id)));
}
