import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { AUN_QA_V4_ID } from "@dse-pms/shared-types";
import {
  createQaEvidenceAnalysis,
  listQaEvidenceAnalyses,
} from "./service.ts";

const enabled = process.env.QA_ANALYSIS_DB_TESTS === "1";
const db = new PrismaClient();
const cycleId = crypto.randomUUID();

describe.skipIf(!enabled)("QA analysis reasoning-factor persistence", () => {
  let requirementCode: string;
  let expectationId: string;

  beforeAll(async () => {
    const expectation = await db.qaQualityExpectation.findFirstOrThrow({
      where: {
        active: true,
        requirement: {
          criterion: {
            frameworkId: AUN_QA_V4_ID,
          },
        },
      },
      select: {
        id: true,
        requirement: {
          select: {
            code: true,
          },
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    expectationId = expectation.id;
    requirementCode = expectation.requirement.code;

    await db.qaAssessmentCycle.create({
      data: {
        id: cycleId,
        programmeId: "dse",
        frameworkId: AUN_QA_V4_ID,
        title: "Issue 308 reasoning-factor persistence test",
        reportingStart: new Date("2025-01-01T00:00:00.000Z"),
        reportingEnd: new Date("2025-12-31T23:59:59.999Z"),
      },
    });
  });

  afterAll(async () => {
    await db.qaAssessmentCycle.delete({
      where: { id: cycleId },
    });
    await db.$disconnect();
  });

  test("reasoningFactors survive create and list round-trip", async () => {
    const reasoningFactors = {
      evidence: [
        {
          expectedEvidenceId: "test:evidence:1",
          evidenceType: "assessment-plan",
          role: "required" as const,
          findingState: "satisfied" as const,
          acceptedCandidateKeys: ["structured:assessment:test-assessment"],
          rejectedScopeCount: 2,
          rejectedTemporalCount: 1,
          rejectedAuthorityCount: 3,
        },
      ],
      relationships: [
        {
          fromEvidenceType: "assessment-plan",
          toEvidenceType: "rubric",
          relation: "supports" as const,
          state: "satisfied" as const,
          matchedPairs: [
            {
              fromCandidateKey: "structured:assessment:test-assessment",
              toCandidateKey: "structured:rubric:test-rubric",
            },
          ],
          explanation: "supports: exact assessment scope proves the relationship.",
        },
      ],
    };

    const created = await createQaEvidenceAnalysis({
      programmeId: "dse",
      cycleId,
      requirementCode,
      expectationId,
      applicability: "applicable",
      applicabilityReason: "Applicable for persistence regression.",
      state: "evidenceIdentified",
      explanation: "Persistence regression analysis.",
      confidence: null,
      uncertaintyNote: "",
      engine: "deterministic-rules",
      engineVersion: "2.0.0",
      promptVersion: "",
      reasoningFactors,
      sources: [],
    });

    expect(created.reasoningFactors).toEqual(reasoningFactors);

    const history = await listQaEvidenceAnalyses(
      "dse",
      cycleId,
      requirementCode,
    );
    const listed = history.find((analysis) => analysis.id === created.id);

    expect(listed).toBeDefined();
    expect(listed?.reasoningFactors).toEqual(reasoningFactors);

    const stored = await db.$queryRaw<Array<{ reasoningFactors: unknown }>>`
      SELECT "reasoningFactors"
      FROM "QaEvidenceAnalysis"
      WHERE id = ${created.id}
    `;

    expect(stored).toHaveLength(1);
    expect(stored[0]?.reasoningFactors).toEqual(reasoningFactors);
  });
});
