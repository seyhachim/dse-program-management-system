import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { serializeDocumentContent } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  QaSarBookRevisionConflictError,
  getActiveQaSarBookSectionAssignment,
  listQaSarBookSectionAssignments,
  listQaSarBookSectionRevisions,
  saveQaSarBookNarrativeSection,
  upsertQaSarBookSectionAssignment,
} from "./narrative-service.ts";

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

dbDescribe("SAR book static-section revision and assignment integrity", () => {
  test("appends immutable revisions, rejects stale saves, and preserves reassignment history", async () => {
    const suffix = randomUUID();
    const programme = await prisma.programme.findFirstOrThrow({
      select: { id: true },
    });
    const framework = await prisma.qaFramework.findFirstOrThrow({
      select: { id: true },
    });
    const qaContributorRole = await prisma.role.findUniqueOrThrow({
      where: { slug: "qa_contributor" },
      select: { id: true },
    });

    const [manager, contributorA, contributorB] = await Promise.all([
      prisma.user.create({
        data: {
          email: `sar-book-manager-${suffix}@dse.invalid`,
          name: "SAR Book Test Manager",
        },
      }),
      prisma.user.create({
        data: {
          email: `sar-book-contributor-a-${suffix}@dse.invalid`,
          name: "SAR Book Contributor A",
        },
      }),
      prisma.user.create({
        data: {
          email: `sar-book-contributor-b-${suffix}@dse.invalid`,
          name: "SAR Book Contributor B",
        },
      }),
    ]);

    await Promise.all([
      prisma.userRoleAssignment.create({
        data: {
          userId: contributorA.id,
          roleId: qaContributorRole.id,
          programmeId: programme.id,
        },
      }),
      prisma.userRoleAssignment.create({
        data: {
          userId: contributorB.id,
          roleId: qaContributorRole.id,
          programmeId: programme.id,
        },
      }),
    ]);

    const cycle = await prisma.qaAssessmentCycle.create({
      data: {
        programmeId: programme.id,
        frameworkId: framework.id,
        title: `SAR Book Revision Test ${suffix}`,
        reportingStart: new Date("2026-01-01T00:00:00.000Z"),
        reportingEnd: new Date("2026-12-31T00:00:00.000Z"),
        createdById: manager.id,
      },
    });
    const sectionKey = "part1.executive-summary";

    const firstContent = documentWithText("First immutable SAR revision");
    const first = await saveQaSarBookNarrativeSection(
      cycle.id,
      sectionKey,
      {
        programmeId: programme.id,
        content: firstContent,
        baseRevisionId: null,
      },
      contributorA.id,
    );
    expect(first.revisionNumber).toBe(1);
    expect(first.revisionId).toBeTruthy();

    const secondContent = documentWithText(
      "Second SAR revision after review preparation",
    );
    const second = await saveQaSarBookNarrativeSection(
      cycle.id,
      sectionKey,
      {
        programmeId: programme.id,
        content: secondContent,
        baseRevisionId: first.revisionId,
      },
      contributorA.id,
    );
    expect(second.revisionNumber).toBe(2);
    expect(second.revisionId).not.toBe(first.revisionId);

    let staleRejected = false;
    try {
      await saveQaSarBookNarrativeSection(
        cycle.id,
        sectionKey,
        {
          programmeId: programme.id,
          content: documentWithText("Stale overwrite attempt"),
          baseRevisionId: first.revisionId,
        },
        contributorA.id,
      );
    } catch (error) {
      staleRejected = error instanceof QaSarBookRevisionConflictError;
    }
    expect(staleRejected).toBe(true);

    const revisions = await listQaSarBookSectionRevisions(
      programme.id,
      cycle.id,
      sectionKey,
    );
    const firstRevisionId = first.revisionId;

    if (!firstRevisionId) {
      throw new Error("Expected first SAR revision ID");
    }

    expect(firstRevisionId).toBeTruthy();
    expect(revisions.map((revision) => revision.revisionNumber)).toEqual([
      2, 1,
    ]);
    expect(revisions[1]?.id).toBe(firstRevisionId);
    expect(revisions[1]?.content).toBe(firstContent);
    expect(revisions[0]?.content).toBe(secondContent);

    const assignedA = await upsertQaSarBookSectionAssignment(
      cycle.id,
      sectionKey,
      { programmeId: programme.id, assigneeId: contributorA.id },
      manager.id,
    );
    expect(assignedA.assignee.id).toBe(contributorA.id);

    const assignedB = await upsertQaSarBookSectionAssignment(
      cycle.id,
      sectionKey,
      { programmeId: programme.id, assigneeId: contributorB.id },
      manager.id,
    );
    expect(assignedB.assignee.id).toBe(contributorB.id);

    const active = await getActiveQaSarBookSectionAssignment(
      programme.id,
      cycle.id,
      sectionKey,
    );
    expect(active?.assignee.id).toBe(contributorB.id);
    expect(
      await listQaSarBookSectionAssignments(programme.id, cycle.id),
    ).toHaveLength(1);

    const assignmentHistory = await prisma.$queryRaw<
      Array<{ assigneeId: string; endedAt: Date | null }>
    >`
      SELECT "assigneeId", "endedAt"
      FROM "QaSarBookSectionAssignment"
      WHERE "cycleId" = ${cycle.id}
        AND "sectionKey" = ${sectionKey}
      ORDER BY "assignedAt", "id"
    `;
    expect(assignmentHistory).toHaveLength(2);
    expect(
      assignmentHistory.some(
        (row) => row.assigneeId === contributorA.id && row.endedAt !== null,
      ),
    ).toBe(true);
    expect(
      assignmentHistory.some(
        (row) => row.assigneeId === contributorB.id && row.endedAt === null,
      ),
    ).toBe(true);

    const revisionsAfterReassignment = await listQaSarBookSectionRevisions(
      programme.id,
      cycle.id,
      sectionKey,
    );
    expect(revisionsAfterReassignment.map((revision) => revision.id)).toEqual(
      revisions.map((revision) => revision.id),
    );
  });
});
