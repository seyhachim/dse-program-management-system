import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { AUN_QA_V4_ID } from "@dse-pms/shared-types";
import { createQaEvidenceAnalysis } from "../analysis/service.ts";
import { createQaAnalysisReview, listQaAnalysisReviews } from "./service.ts";

const enabled = process.env.QA_REVIEW_DB_TESTS === "1";
const db = new PrismaClient();
const cycleId = crypto.randomUUID();

let requirementCode = "";
let expectationId = "";
let reviewerId = "";
let analysisId = "";

describe.skipIf(!enabled)("structured QA expert corrections", () => {
  beforeAll(async () => {
    const expectation = await db.qaQualityExpectation.findFirstOrThrow({
      where: {
        active: true,
        requirement: { criterion: { frameworkId: AUN_QA_V4_ID } },
      },
      select: { id: true, requirement: { select: { code: true } } },
      orderBy: { id: "asc" },
    });
    expectationId = expectation.id;
    requirementCode = expectation.requirement.code;

    const reviewer = await db.user.findUniqueOrThrow({
      where: { email: "qa@dse.dev" },
      select: { id: true },
    });
    reviewerId = reviewer.id;

    await db.qaAssessmentCycle.create({
      data: {
        id: cycleId,
        programmeId: "dse",
        frameworkId: AUN_QA_V4_ID,
        title: "Issue 309 structured correction test",
        reportingStart: new Date("2025-01-01T00:00:00.000Z"),
        reportingEnd: new Date("2025-12-31T23:59:59.999Z"),
      },
    });

    const analysis = await createQaEvidenceAnalysis({
      programmeId: "dse",
      cycleId,
      requirementCode,
      expectationId,
      applicability: "applicable",
      applicabilityReason: "DB integrity regression",
      state: "evidenceIdentified",
      explanation: "Original immutable machine classification.",
      confidence: 0.9,
      uncertaintyNote: "",
      engine: "deterministic-rules",
      engineVersion: "2.0.0",
      promptVersion: "",
      sources: [],
    });
    analysisId = analysis.id;
  });

  afterAll(async () => {
    await db.qaAssessmentCycle.delete({ where: { id: cycleId } });
    await db.$disconnect();
  });

  test("stores queryable reason codes and exact correction targets without changing machine output", async () => {
    const created = await createQaAnalysisReview(
      analysisId,
      {
        programmeId: "dse",
        decision: "rejected",
        comment: "The accepted source belongs to a different CourseSpec version.",
        reasonCode: "wrongScope",
        correctedState: "expertReviewRequired",
        correctedEvidenceCandidateKeys: ["candidate:corrected:1"],
        correctedRelationships: [
          {
            fromCandidateKey: "candidate:a",
            toCandidateKey: "candidate:b",
            relation: "supports",
            state: "ambiguous",
          },
        ],
      },
      reviewerId,
    );

    expect(created.reasonCategory).toBe("scope");
    expect(created.reasonCode).toBe("wrongScope");
    expect(created.correctedState).toBe("expertReviewRequired");
    expect(created.correctedEvidenceCandidateKeys).toEqual(["candidate:corrected:1"]);
    expect(created.correctedRelationships).toHaveLength(1);

    const history = await listQaAnalysisReviews("dse", cycleId);
    expect(history.find((review) => review.id === created.id)).toEqual(created);

    const queryable = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "QaEvidenceAnalysisReview"
      WHERE "reasonCategory" = 'scope' AND "reasonCode" = 'wrongScope'
    `;
    expect(Number(queryable[0]?.count ?? 0)).toBeGreaterThanOrEqual(1);

    const original = await db.qaEvidenceAnalysis.findUniqueOrThrow({
      where: { id: analysisId },
      select: { state: true, explanation: true },
    });
    expect(original.state).toBe("EvidenceIdentified");
    expect(original.explanation).toBe("Original immutable machine classification.");
  });

  test("database rejects update and delete of a committed review", async () => {
    const review = await db.qaEvidenceAnalysisReview.findFirstOrThrow({
      where: { analysisId },
      select: { id: true },
    });

    await expect(
      db.$executeRaw`UPDATE "QaEvidenceAnalysisReview" SET comment = 'mutated' WHERE id = ${review.id}`,
    ).rejects.toThrow(/append-only/i);

    await expect(
      db.$executeRaw`DELETE FROM "QaEvidenceAnalysisReview" WHERE id = ${review.id}`,
    ).rejects.toThrow(/append-only/i);
  });
});
