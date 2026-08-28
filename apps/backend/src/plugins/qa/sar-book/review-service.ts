import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  QA_SAR_BOOK_STATIC_PARTS,
  QaSarBookReviewReadinessViewSchema,
  QaSarBookSectionReviewViewSchema,
  findQaSarBookStaticSection,
  type CreateQaSarBookSectionReviewInput,
  type QaSarBookPartKey,
  type QaSarBookReadinessBlocker,
  type QaSarBookReviewReadinessView,
  type QaSarBookSectionReviewView,
  type QaSarBookStaticSectionReadiness,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  QaSarResourceNotFoundError,
  QaSarScopeMismatchError,
} from "../sar/service.ts";
import { getQaSarBookEvidenceRegister } from "./evidence-register-service.ts";
import { getQaSarBookPart2 } from "./part2-service.ts";
import { getQaSarBook } from "./service.ts";

export class QaSarBookReviewConflictError extends Error {}

const decisionFromDb = {
  Approved: "approved",
  ChangesRequested: "changesRequested",
} as const;

const decisionToDb = {
  approved: "Approved",
  changesRequested: "ChangesRequested",
} as const;

type RevisionRow = {
  id: string;
  programmeId: string;
  cycleId: string;
  sectionKey: string;
  revisionNumber: number;
  plainText: string;
  createdAt: Date;
};

type ReviewRow = {
  id: string;
  programmeId: string;
  cycleId: string;
  sectionKey: string;
  revisionId: string;
  decision: keyof typeof decisionFromDb;
  comment: string;
  reviewerId: string;
  reviewerName: string;
  createdAt: Date;
};

async function assertCycleScope(programmeId: string, cycleId: string): Promise<void> {
  const cycle = await prisma.qaAssessmentCycle.findUnique({
    where: { id: cycleId },
    select: { programmeId: true },
  });
  if (!cycle) throw new QaSarResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId) {
    throw new QaSarScopeMismatchError("SAR book review belongs to a different programme");
  }
}

async function latestStaticRevisions(
  programmeId: string,
  cycleId: string,
): Promise<Map<string, RevisionRow>> {
  const rows = await prisma.$queryRaw<RevisionRow[]>(Prisma.sql`
    SELECT DISTINCT ON (r."sectionKey")
      r."id", r."programmeId", r."cycleId", r."sectionKey",
      r."revisionNumber", r."plainText", r."createdAt"
    FROM "QaSarBookSectionRevision" r
    WHERE r."programmeId" = ${programmeId}
      AND r."cycleId" = ${cycleId}
    ORDER BY r."sectionKey", r."revisionNumber" DESC
  `);
  return new Map(rows.map((row) => [row.sectionKey, row]));
}

async function latestReviewsForRevisions(revisionIds: string[]): Promise<Map<string, ReviewRow>> {
  if (revisionIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<ReviewRow[]>(Prisma.sql`
    SELECT DISTINCT ON (r."revisionId")
      r."id", r."programmeId", r."cycleId", r."sectionKey", r."revisionId",
      r."decision", r."comment", r."reviewerId", u."name" AS "reviewerName", r."createdAt"
    FROM "QaSarBookSectionReview" r
    JOIN "User" u ON u."id" = r."reviewerId"
    WHERE r."revisionId" IN (${Prisma.join(revisionIds)})
    ORDER BY r."revisionId", r."createdAt" DESC, r."id" DESC
  `);
  return new Map(rows.map((row) => [row.revisionId, row]));
}

function reviewToView(row: ReviewRow, revisionNumber: number): QaSarBookSectionReviewView {
  const section = findQaSarBookStaticSection(row.sectionKey);
  if (!section) throw new QaSarResourceNotFoundError("Reviewed SAR book section no longer exists");
  return QaSarBookSectionReviewViewSchema.parse({
    id: row.id,
    programmeId: row.programmeId,
    cycleId: row.cycleId,
    sectionKey: row.sectionKey,
    sectionTitle: section.title,
    revisionId: row.revisionId,
    revisionNumber,
    decision: decisionFromDb[row.decision],
    comment: row.comment,
    reviewer: { id: row.reviewerId, name: row.reviewerName },
    createdAt: row.createdAt.toISOString(),
  });
}

function pushBlocker(
  blockers: QaSarBookReadinessBlocker[],
  blocker: QaSarBookReadinessBlocker,
): void {
  blockers.push(blocker);
}

export async function getQaSarBookReviewReadiness(
  programmeId: string,
  cycleId: string,
): Promise<QaSarBookReviewReadinessView> {
  await assertCycleScope(programmeId, cycleId);
  const [book, part2, evidence, revisionMap] = await Promise.all([
    getQaSarBook(programmeId, cycleId),
    getQaSarBookPart2(programmeId, cycleId),
    getQaSarBookEvidenceRegister(programmeId, cycleId, "working"),
    latestStaticRevisions(programmeId, cycleId),
  ]);
  const reviewMap = await latestReviewsForRevisions([...revisionMap.values()].map((row) => row.id));
  const blockers: QaSarBookReadinessBlocker[] = [];
  const staticSections: QaSarBookStaticSectionReadiness[] = [];

  for (const part of QA_SAR_BOOK_STATIC_PARTS) {
    for (const section of part.sections) {
      if (section.source === "generated") continue;
      const revision = revisionMap.get(section.key) ?? null;
      const review = revision ? reviewMap.get(revision.id) ?? null : null;
      const contentReady = Boolean(revision?.plainText.trim());
      const reviewStatus = !revision || !contentReady
        ? "missing"
        : !review
          ? "pendingReview"
          : review.decision === "ChangesRequested"
            ? "changesRequested"
            : "approved";

      staticSections.push({
        part: part.id,
        sectionKey: section.key,
        sectionTitle: section.title,
        source: section.source as "bookNarrative" | "structured",
        required: section.required,
        revisionId: revision?.id ?? null,
        revisionNumber: revision?.revisionNumber ?? null,
        contentReady,
        reviewStatus,
        latestReview: review && revision ? reviewToView(review, revision.revisionNumber) : null,
      });

      if (!section.required) continue;
      if (!revision || !contentReady) {
        pushBlocker(blockers, {
          type: "missingSection",
          part: part.id,
          sectionKey: section.key,
          requirementCode: null,
          message: `${section.title} has no complete current revision.`,
        });
      } else if (!review) {
        pushBlocker(blockers, {
          type: "sectionReviewPending",
          part: part.id,
          sectionKey: section.key,
          requirementCode: null,
          message: `${section.title} revision ${revision.revisionNumber} still needs review.`,
        });
      } else if (review.decision === "ChangesRequested") {
        pushBlocker(blockers, {
          type: "sectionChangesRequested",
          part: part.id,
          sectionKey: section.key,
          requirementCode: null,
          message: `${section.title} revision ${revision.revisionNumber} has unresolved requested changes.`,
        });
      }
    }
  }

  const criteria = part2.criteria.map((criterion) => {
    let approved = 0;
    let changesRequested = 0;
    let pending = 0;
    let brokenEvidenceReferences = 0;
    for (const requirement of criterion.requirements) {
      brokenEvidenceReferences += requirement.brokenEvidenceReferenceIds.length;
      if (requirement.workflowStatus === "approved") approved += 1;
      else if (requirement.workflowStatus === "changesRequested") changesRequested += 1;
      else pending += 1;

      if (requirement.workflowStatus !== "approved") {
        pushBlocker(blockers, {
          type: "requirementNotApproved",
          part: "part2",
          sectionKey: null,
          requirementCode: requirement.requirementCode,
          message: `Requirement ${requirement.requirementCode} is ${requirement.workflowStatus}, not approved.`,
        });
      } else if (!requirement.officialPin || !requirement.approvedSubmission ||
        requirement.officialPin.submissionId !== requirement.approvedSubmission.submissionId ||
        requirement.officialPin.submissionVersion !== requirement.approvedSubmission.submissionVersion) {
        pushBlocker(blockers, {
          type: "invalidRequirementPin",
          part: "part2",
          sectionKey: null,
          requirementCode: requirement.requirementCode,
          message: `Requirement ${requirement.requirementCode} does not have a valid approved submission pin.`,
        });
      }
      if (requirement.brokenEvidenceReferenceIds.length > 0) {
        pushBlocker(blockers, {
          type: "brokenEvidence",
          part: "part2",
          sectionKey: null,
          requirementCode: requirement.requirementCode,
          message: `Requirement ${requirement.requirementCode} has ${requirement.brokenEvidenceReferenceIds.length} broken evidence reference(s).`,
        });
      }
    }
    return {
      criterionCode: criterion.criterionCode,
      criterionTitle: criterion.criterionTitle,
      total: criterion.requirements.length,
      approved,
      pending,
      changesRequested,
      brokenEvidenceReferences,
    };
  });

  for (const issue of evidence.issues) {
    pushBlocker(blockers, {
      type: "brokenEvidence",
      part: issue.requirementCode ? "part2" : ((book.parts.find((part) => part.sections.some((section) => section.key === issue.sectionKey))?.id ?? "part4") as QaSarBookPartKey),
      sectionKey: issue.sectionKey,
      requirementCode: issue.requirementCode,
      message: issue.message,
    });
  }

  const partSummary = (part: QaSarBookPartKey, title: string, total: number, ready: number) => ({
    part,
    title,
    total,
    ready,
    blockers: blockers.filter((blocker) => blocker.part === part).length,
  });
  const staticFor = (part: "part1" | "part3" | "part4") => staticSections.filter((section) => section.part === part);
  const readyStaticFor = (part: "part1" | "part3" | "part4") => staticFor(part).filter((section) => section.reviewStatus === "approved").length;
  const part4RegisterReady = evidence.issues.length === 0 ? 1 : 0;

  return QaSarBookReviewReadinessViewSchema.parse({
    programmeId,
    cycleId,
    generatedAt: new Date().toISOString(),
    readyForFinalisation: blockers.length === 0,
    note: "Workflow readiness only — not an AUN-QA compliance score or accreditation verdict.",
    parts: [
      partSummary("part1", "Part 1 — Introduction", staticFor("part1").length, readyStaticFor("part1")),
      partSummary("part2", "Part 2 — AUN-QA Criteria 1–8", part2.totals.total, part2.totals.approved),
      partSummary("part3", "Part 3 — Strengths and Weaknesses Analysis", staticFor("part3").length, readyStaticFor("part3")),
      partSummary("part4", "Part 4 — Appendices", staticFor("part4").length + 1, readyStaticFor("part4") + part4RegisterReady),
    ],
    staticSections,
    criteria,
    blockers,
  });
}

export async function createQaSarBookSectionReview(
  cycleId: string,
  sectionKey: string,
  input: CreateQaSarBookSectionReviewInput,
  reviewerId: string,
): Promise<QaSarBookSectionReviewView> {
  const section = findQaSarBookStaticSection(sectionKey);
  if (!section || section.source === "generated") {
    throw new QaSarResourceNotFoundError("Reviewable SAR book section not found");
  }
  await assertCycleScope(input.programmeId, cycleId);
  const currentRows = await prisma.$queryRaw<RevisionRow[]>(Prisma.sql`
    SELECT "id", "programmeId", "cycleId", "sectionKey", "revisionNumber", "plainText", "createdAt"
    FROM "QaSarBookSectionRevision"
    WHERE "programmeId" = ${input.programmeId}
      AND "cycleId" = ${cycleId}
      AND "sectionKey" = ${sectionKey}
    ORDER BY "revisionNumber" DESC
    LIMIT 1
  `);
  const current = currentRows[0];
  if (!current) throw new QaSarBookReviewConflictError("Save this SAR book section before reviewing it");
  if (current.id !== input.revisionId) {
    throw new QaSarBookReviewConflictError("This review targets a stale section revision. Reload before deciding.");
  }
  if (!current.plainText.trim()) {
    throw new QaSarBookReviewConflictError("An empty SAR book section cannot be approved or sent back for changes");
  }

  const id = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "QaSarBookSectionReview" (
      "id", "programmeId", "cycleId", "sectionKey", "revisionId",
      "decision", "comment", "reviewerId", "createdAt"
    ) VALUES (
      ${id}, ${input.programmeId}, ${cycleId}, ${sectionKey}, ${input.revisionId},
      ${decisionToDb[input.decision]}, ${input.comment}, ${reviewerId}, CURRENT_TIMESTAMP
    )
  `);
  const rows = await prisma.$queryRaw<ReviewRow[]>(Prisma.sql`
    SELECT r."id", r."programmeId", r."cycleId", r."sectionKey", r."revisionId",
      r."decision", r."comment", r."reviewerId", u."name" AS "reviewerName", r."createdAt"
    FROM "QaSarBookSectionReview" r
    JOIN "User" u ON u."id" = r."reviewerId"
    WHERE r."id" = ${id}
  `);
  const created = rows[0];
  if (!created) throw new QaSarResourceNotFoundError("Created SAR book review could not be reloaded");
  return reviewToView(created, current.revisionNumber);
}

export async function listQaSarBookSectionReviews(
  programmeId: string,
  cycleId: string,
  sectionKey: string,
): Promise<QaSarBookSectionReviewView[]> {
  const section = findQaSarBookStaticSection(sectionKey);
  if (!section || section.source === "generated") throw new QaSarResourceNotFoundError("Reviewable SAR book section not found");
  await assertCycleScope(programmeId, cycleId);
  const rows = await prisma.$queryRaw<Array<ReviewRow & { revisionNumber: number }>>(Prisma.sql`
    SELECT r."id", r."programmeId", r."cycleId", r."sectionKey", r."revisionId",
      r."decision", r."comment", r."reviewerId", u."name" AS "reviewerName", r."createdAt",
      v."revisionNumber"
    FROM "QaSarBookSectionReview" r
    JOIN "QaSarBookSectionRevision" v ON v."id" = r."revisionId"
    JOIN "User" u ON u."id" = r."reviewerId"
    WHERE r."programmeId" = ${programmeId}
      AND r."cycleId" = ${cycleId}
      AND r."sectionKey" = ${sectionKey}
    ORDER BY r."createdAt" DESC, r."id" DESC
  `);
  return rows.map((row) => reviewToView(row, row.revisionNumber));
}
