import type { QaSarProgressItemView } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";

const sectionStatus = {
  NotStarted: "notStarted",
  Drafting: "drafting",
  ReadyForReview: "readyForReview",
  UnderReview: "underReview",
  ChangesRequested: "changesRequested",
  Approved: "approved",
} as const;

const reviewDecision = {
  Approved: "approved",
  ChangesRequested: "changesRequested",
  MoreEvidenceRequested: "moreEvidenceRequested",
} as const;

export async function listQaSarProgress(
  programmeId: string,
  cycleId: string,
): Promise<QaSarProgressItemView[]> {
  const cycle = await prisma.qaAssessmentCycle.findUnique({
    where: { id: cycleId },
    select: { programmeId: true },
  });
  if (!cycle) throw new QaSarResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId) {
    throw new QaSarScopeMismatchError("SAR progress belongs to a different programme");
  }

  const sections = await prisma.qaSarSection.findMany({
    where: { programmeId, cycleId },
    include: {
      requirement: { select: { code: true } },
      submissions: {
        orderBy: { version: "desc" },
        take: 1,
        include: {
          reviews: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  return sections.map((section) => {
    const latest = section.submissions[0] ?? null;
    const review = latest?.reviews[0] ?? null;
    return {
      requirementCode: section.requirement.code,
      status: sectionStatus[section.status],
      latestSubmissionVersion: latest?.version ?? null,
      latestReviewDecision: review ? reviewDecision[review.decision] : null,
    };
  });
}
