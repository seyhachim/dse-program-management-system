import type { Prisma } from "@prisma/client";
import {
  QaSarDocumentSchema,
  type CreateQaSarReviewInput,
  type QaSarReviewDecision,
  type QaSarReviewQueueView,
  type QaSarReviewView,
  type QaSarSubmissionView,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  QaSarResourceNotFoundError,
  QaSarScopeMismatchError,
} from "../sar/service.ts";

const decisionToDb = {
  approved: "Approved",
  changesRequested: "ChangesRequested",
  moreEvidenceRequested: "MoreEvidenceRequested",
} as const;

const decisionFromDb = {
  Approved: "approved",
  ChangesRequested: "changesRequested",
  MoreEvidenceRequested: "moreEvidenceRequested",
} as const;

export class QaSarSubmissionNotReadyError extends Error {}
export class QaSarReviewStateError extends Error {}

const submissionInclude = {
  requirement: {
    select: {
      code: true,
      title: true,
      criterion: { select: { code: true, title: true } },
    },
  },
  submittedBy: { select: { id: true, name: true } },
  reviews: {
    orderBy: { createdAt: "asc" as const },
    include: { reviewer: { select: { id: true, name: true } } },
  },
} as const;

function reviewToView(review: {
  id: string;
  decision: keyof typeof decisionFromDb;
  comment: string;
  createdAt: Date;
  reviewer: { id: string; name: string };
}): QaSarReviewView {
  return {
    id: review.id,
    decision: decisionFromDb[review.decision] as QaSarReviewDecision,
    comment: review.comment,
    reviewer: review.reviewer,
    createdAt: review.createdAt.toISOString(),
  };
}

function submissionToView(row: {
  id: string;
  programmeId: string;
  cycleId: string;
  requirementId: string;
  sectionId: string;
  version: number;
  content: Prisma.JsonValue;
  plainText: string;
  practiceDescribed: boolean;
  resultsAnalysed: boolean;
  improvementExplained: boolean;
  evidenceIds: string[];
  submittedAt: Date;
  requirement: {
    code: string;
    title: string;
    criterion: { code: string; title: string };
  };
  submittedBy: { id: string; name: string };
  reviews: Array<Parameters<typeof reviewToView>[0]>;
}): QaSarSubmissionView {
  return {
    id: row.id,
    programmeId: row.programmeId,
    cycleId: row.cycleId,
    sectionId: row.sectionId,
    criterionCode: row.requirement.criterion.code,
    criterionTitle: row.requirement.criterion.title,
    requirementCode: row.requirement.code,
    requirementTitle: row.requirement.title,
    version: row.version,
    content: QaSarDocumentSchema.parse(row.content),
    plainText: row.plainText,
    readiness: {
      practiceDescribed: row.practiceDescribed,
      resultsAnalysed: row.resultsAnalysed,
      improvementExplained: row.improvementExplained,
    },
    evidenceIds: row.evidenceIds,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt.toISOString(),
    reviews: row.reviews.map(reviewToView),
  };
}

async function resolveSection(programmeId: string, cycleId: string, requirementCode: string) {
  const section = await prisma.qaSarSection.findFirst({
    where: {
      programmeId,
      cycleId,
      requirement: { code: requirementCode },
    },
    include: {
      requirement: { select: { id: true, code: true } },
    },
  });
  if (!section) throw new QaSarResourceNotFoundError("SAR section has not been drafted yet");
  return section;
}

function evidenceIdsFromContent(content: Prisma.JsonValue): string[] {
  const parsed = QaSarDocumentSchema.parse(content);
  return [
    ...new Set(
      parsed.blocks
        .filter((block) => block.type === "evidenceReference")
        .map((block) => block.evidenceId),
    ),
  ];
}

export async function submitQaSarSection(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
  userId: string,
): Promise<QaSarSubmissionView> {
  const section = await resolveSection(programmeId, cycleId, requirementCode);
  if (!["Drafting", "ChangesRequested"].includes(section.status)) {
    throw new QaSarReviewStateError(
      `SAR section cannot be submitted while status is ${section.status}`,
    );
  }
  if (!section.plainText.trim()) {
    throw new QaSarSubmissionNotReadyError("Write SAR narrative content before submitting for review");
  }

  const evidenceIds = evidenceIdsFromContent(section.content);
  if (evidenceIds.length > 0) {
    const mappings = await prisma.qaEvidenceMapping.findMany({
      where: {
        programmeId,
        cycleId,
        requirementId: section.requirementId,
        evidenceId: { in: evidenceIds },
      },
      select: { evidenceId: true },
    });
    const allowed = new Set(mappings.map((mapping) => mapping.evidenceId));
    const invalid = evidenceIds.find((id) => !allowed.has(id));
    if (invalid) {
      throw new QaSarSubmissionNotReadyError(
        "One or more evidence references are no longer mapped to this requirement",
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const latest = await tx.qaSarSubmission.findFirst({
      where: { sectionId: section.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const submission = await tx.qaSarSubmission.create({
      data: {
        programmeId,
        cycleId,
        requirementId: section.requirementId,
        sectionId: section.id,
        version: (latest?.version ?? 0) + 1,
        content: section.content as Prisma.InputJsonValue,
        plainText: section.plainText,
        practiceDescribed: section.practiceDescribed,
        resultsAnalysed: section.resultsAnalysed,
        improvementExplained: section.improvementExplained,
        evidenceIds,
        submittedById: userId,
      },
      include: submissionInclude,
    });
    await tx.qaSarSection.update({
      where: { id: section.id },
      data: { status: "UnderReview" },
    });
    return submission;
  });

  return submissionToView(created);
}

export async function listQaSarSubmissionHistory(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<QaSarSubmissionView[]> {
  const section = await resolveSection(programmeId, cycleId, requirementCode);
  const rows = await prisma.qaSarSubmission.findMany({
    where: { programmeId, cycleId, sectionId: section.id },
    orderBy: { version: "desc" },
    include: submissionInclude,
  });
  return rows.map(submissionToView);
}

export async function getQaSarReviewQueue(programmeId: string): Promise<QaSarReviewQueueView> {
  const cycle =
    (await prisma.qaAssessmentCycle.findFirst({
      where: { programmeId, status: "Active" },
      orderBy: [{ reportingEnd: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    })) ??
    (await prisma.qaAssessmentCycle.findFirst({
      where: { programmeId },
      orderBy: [{ reportingEnd: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    }));
  if (!cycle) return { programmeId, cycleId: null, submissions: [] };

  const rows = await prisma.qaSarSubmission.findMany({
    where: {
      programmeId,
      cycleId: cycle.id,
      section: { status: "UnderReview" },
    },
    orderBy: [{ sectionId: "asc" }, { version: "desc" }],
    include: submissionInclude,
  });

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.sectionId)) latest.set(row.sectionId, row);
  }
  return {
    programmeId,
    cycleId: cycle.id,
    submissions: [...latest.values()].map(submissionToView),
  };
}

export async function reviewQaSarSubmission(
  submissionId: string,
  input: CreateQaSarReviewInput,
  reviewerId: string,
): Promise<QaSarSubmissionView> {
  const submission = await prisma.qaSarSubmission.findUnique({
    where: { id: submissionId },
    include: { section: { select: { id: true, programmeId: true, status: true } } },
  });
  if (!submission) throw new QaSarResourceNotFoundError("SAR submission not found");
  if (submission.programmeId !== input.programmeId || submission.section.programmeId !== input.programmeId) {
    throw new QaSarScopeMismatchError("SAR submission belongs to a different programme");
  }
  if (submission.section.status !== "UnderReview") {
    throw new QaSarReviewStateError("This SAR section is no longer under review");
  }

  const latest = await prisma.qaSarSubmission.findFirst({
    where: { sectionId: submission.sectionId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (latest?.id !== submissionId) {
    throw new QaSarReviewStateError("Only the latest SAR submission can receive a decision");
  }

  await prisma.$transaction([
    prisma.qaSarReview.create({
      data: {
        submissionId,
        reviewerId,
        decision: decisionToDb[input.decision],
        comment: input.comment,
      },
    }),
    prisma.qaSarSection.update({
      where: { id: submission.sectionId },
      data: {
        status: input.decision === "approved" ? "Approved" : "ChangesRequested",
      },
    }),
  ]);

  const updated = await prisma.qaSarSubmission.findUnique({
    where: { id: submissionId },
    include: submissionInclude,
  });
  if (!updated) throw new QaSarResourceNotFoundError("Reviewed SAR submission not found");
  return submissionToView(updated);
}

export async function reviseApprovedQaSarSection(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<void> {
  const section = await resolveSection(programmeId, cycleId, requirementCode);
  if (section.status !== "Approved") {
    throw new QaSarReviewStateError("Only an approved SAR section can start a new revision");
  }
  await prisma.qaSarSection.update({
    where: { id: section.id },
    data: { status: "Drafting" },
  });
}

export async function latestApprovedSubmission(
  programmeId: string,
  cycleId: string,
  requirementId: string,
): Promise<QaSarSubmissionView | null> {
  const row = await prisma.qaSarSubmission.findFirst({
    where: {
      programmeId,
      cycleId,
      requirementId,
      reviews: { some: { decision: "Approved" } },
    },
    orderBy: { version: "desc" },
    include: submissionInclude,
  });
  return row ? submissionToView(row) : null;
}
