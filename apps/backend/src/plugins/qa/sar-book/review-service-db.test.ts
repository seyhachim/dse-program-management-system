import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { serializeDocumentContent } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { saveQaSarBookNarrativeSection } from "./narrative-service.ts";
import {
  QaSarBookReviewConflictError,
  createQaSarBookSectionReview,
  listQaSarBookSectionReviews,
} from "./review-service.ts";

const runDbTests =
  process.env.QA_SAR_BOOK_DB_TESTS === "1" ||
  process.env.BACKEND_INTEGRATION_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

function documentWithText(text: string) {
  return serializeDocumentContent({
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

dbDescribe("SAR book exact-version review integrity", () => {
  test("preserves append-only decisions and rejects a stale revision decision", async () => {
    const suffix = randomUUID();
    const programme = await prisma.programme.findFirstOrThrow({ select: { id: true } });
    const framework = await prisma.qaFramework.findFirstOrThrow({ select: { id: true } });
    const [author, reviewer] = await Promise.all([
      prisma.user.create({
        data: { email: `sar-book-review-author-${suffix}@dse.invalid`, name: "SAR Review Author" },
      }),
      prisma.user.create({
        data: { email: `sar-book-reviewer-${suffix}@dse.invalid`, name: "SAR Book Reviewer" },
      }),
    ]);
    const cycle = await prisma.qaAssessmentCycle.create({
      data: {
        programmeId: programme.id,
        frameworkId: framework.id,
        title: `SAR Book Review Test ${suffix}`,
        reportingStart: new Date("2026-01-01T00:00:00.000Z"),
        reportingEnd: new Date("2026-12-31T00:00:00.000Z"),
        createdById: author.id,
      },
    });
    const sectionKey = "part1.executive-summary";
    const first = await saveQaSarBookNarrativeSection(
      cycle.id,
      sectionKey,
      { programmeId: programme.id, content: documentWithText("Initial reviewed narrative"), baseRevisionId: null },
      author.id,
    );
    if (!first.revisionId) throw new Error("Expected first revision ID");

    const requested = await createQaSarBookSectionReview(
      cycle.id,
      sectionKey,
      {
        programmeId: programme.id,
        revisionId: first.revisionId,
        decision: "changesRequested",
        comment: "Add explicit supporting evidence and clarify the result.",
      },
      reviewer.id,
    );
    expect(requested.decision).toBe("changesRequested");

    const approvedSameRevision = await createQaSarBookSectionReview(
      cycle.id,
      sectionKey,
      {
        programmeId: programme.id,
        revisionId: first.revisionId,
        decision: "approved",
        comment: "Accepted after reviewer clarification was recorded.",
      },
      reviewer.id,
    );
    expect(approvedSameRevision.decision).toBe("approved");

    const second = await saveQaSarBookNarrativeSection(
      cycle.id,
      sectionKey,
      {
        programmeId: programme.id,
        content: documentWithText("A newer exact revision requiring its own review"),
        baseRevisionId: first.revisionId,
      },
      author.id,
    );
    expect(second.revisionId).not.toBe(first.revisionId);

    let staleRejected = false;
    try {
      await createQaSarBookSectionReview(
        cycle.id,
        sectionKey,
        {
          programmeId: programme.id,
          revisionId: first.revisionId,
          decision: "approved",
          comment: "This stale decision must fail.",
        },
        reviewer.id,
      );
    } catch (error) {
      staleRejected = error instanceof QaSarBookReviewConflictError;
    }
    expect(staleRejected).toBe(true);

    const history = await listQaSarBookSectionReviews(programme.id, cycle.id, sectionKey);
    expect(history).toHaveLength(2);
    expect(history.every((review) => review.revisionId === first.revisionId)).toBe(true);
    expect(new Set(history.map((review) => review.id)).size).toBe(2);
  });
});
