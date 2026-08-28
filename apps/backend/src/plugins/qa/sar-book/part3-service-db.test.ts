import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { serializeDocumentContent } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { saveQaSarBookNarrativeSection } from "./narrative-service.ts";
import {
  QaSarBookPart3ConflictError,
  addQaSarBookPart3Association,
  getQaSarBookPart3,
  updateQaSarCriterionSelfRating,
  updateQaSarRequirementSelfRating,
} from "./part3-service.ts";

const runDbTests =
  process.env.QA_SAR_BOOK_DB_TESTS === "1" ||
  process.env.BACKEND_INTEGRATION_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

function doc(text: string) {
  return serializeDocumentContent({
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

dbDescribe("SAR book Part 3 persistence", () => {
  test("keeps append-only rating history, exact narrative associations, and no computed verdict", async () => {
    const suffix = randomUUID();
    const programme = await prisma.programme.findFirstOrThrow({ select: { id: true } });
    const framework = await prisma.qaFramework.findFirstOrThrow({
      where: { id: "aun-qa-programme-v4" },
      select: { id: true },
    });
    const requirement = await prisma.qaRequirement.findFirstOrThrow({
      where: { code: "1.1", criterion: { frameworkId: framework.id } },
      select: { id: true, criterion: { select: { code: true } } },
    });
    const actor = await prisma.user.create({
      data: {
        email: `sar-part3-${suffix}@dse.invalid`,
        name: "SAR Part 3 Test Reviewer",
      },
    });
    const cycle = await prisma.qaAssessmentCycle.create({
      data: {
        programmeId: programme.id,
        frameworkId: framework.id,
        title: `SAR Part 3 ${suffix}`,
        reportingStart: new Date("2026-01-01T00:00:00.000Z"),
        reportingEnd: new Date("2026-12-31T00:00:00.000Z"),
        createdById: actor.id,
      },
    });

    await updateQaSarRequirementSelfRating(
      cycle.id,
      "1.1",
      {
        programmeId: programme.id,
        rating: 4,
        justification: "First human judgement based on the programme team's review.",
        evidenceIds: [],
      },
      actor.id,
    );
    await updateQaSarRequirementSelfRating(
      cycle.id,
      "1.1",
      {
        programmeId: programme.id,
        rating: 5,
        justification: "Revised human judgement after the team reviewed additional context.",
        evidenceIds: [],
      },
      actor.id,
    );

    const history = await prisma.$queryRaw<
      Array<{ revisionNumber: number; rating: number; justification: string }>
    >`
      SELECT "revisionNumber", "rating", "justification"
      FROM "QaSarBookRequirementRatingRevision"
      WHERE "cycleId" = ${cycle.id} AND "requirementId" = ${requirement.id}
      ORDER BY "revisionNumber"
    `;
    expect(history.map((row) => row.revisionNumber)).toEqual([1, 2]);
    expect(history.map((row) => row.rating)).toEqual([4, 5]);
    expect(history[0]?.justification).toContain("First human judgement");

    const compatibilityRow = await prisma.qaRequirementAssessment.findUniqueOrThrow({
      where: {
        cycleId_requirementId: { cycleId: cycle.id, requirementId: requirement.id },
      },
    });
    expect(compatibilityRow.rating).toBe(5);

    await updateQaSarCriterionSelfRating(
      cycle.id,
      requirement.criterion.code,
      {
        programmeId: programme.id,
        rating: 5,
        opinion: "The SAR team records this criterion-level opinion explicitly.",
        evidenceIds: [],
      },
      actor.id,
    );

    const strengths = await saveQaSarBookNarrativeSection(
      cycle.id,
      "part3.strengths",
      { programmeId: programme.id, content: doc("A programme strength grounded in reviewed practice."), baseRevisionId: null },
      actor.id,
    );
    if (!strengths.revisionId) throw new Error("Expected strengths revision");

    await addQaSarBookPart3Association(
      cycle.id,
      {
        programmeId: programme.id,
        revisionId: strengths.revisionId,
        kind: "strength",
        criterionCode: "1",
        requirementCode: "1.1",
      },
      actor.id,
    );

    const nextStrengths = await saveQaSarBookNarrativeSection(
      cycle.id,
      "part3.strengths",
      {
        programmeId: programme.id,
        content: doc("A newer strength narrative creates a new exact revision boundary."),
        baseRevisionId: strengths.revisionId,
      },
      actor.id,
    );

    let staleRejected = false;
    try {
      await addQaSarBookPart3Association(
        cycle.id,
        {
          programmeId: programme.id,
          revisionId: strengths.revisionId,
          kind: "strength",
          criterionCode: "1",
          requirementCode: "1.1",
        },
        actor.id,
      );
    } catch (error) {
      staleRejected = error instanceof QaSarBookPart3ConflictError;
    }
    expect(staleRejected).toBe(true);
    expect(nextStrengths.revisionId).not.toBe(strengths.revisionId);

    const view = await getQaSarBookPart3(programme.id, cycle.id);
    expect(view.criteria[0]?.requirements.find((item) => item.requirementCode === "1.1")?.rating).toBe(5);
    expect(view.criteria[0]?.rating).toBe(5);
    expect(view.associations).toHaveLength(0);
    expect("overallRating" in view).toBe(false);
    expect("accreditationVerdict" in view).toBe(false);
  });
});
