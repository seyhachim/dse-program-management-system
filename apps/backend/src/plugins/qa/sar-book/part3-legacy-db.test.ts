import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../core/db/prisma.ts";

const runDbTests =
  process.env.QA_SAR_BOOK_DB_TESTS === "1" ||
  process.env.BACKEND_INTEGRATION_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

dbDescribe("SAR book Part 3 legacy self-assessment compatibility", () => {
  test("direct QaRequirementAssessment writes append auditable Part 3 history", async () => {
    const suffix = randomUUID();
    const programme = await prisma.programme.findFirstOrThrow({ select: { id: true } });
    const framework = await prisma.qaFramework.findUniqueOrThrow({
      where: { id: "aun-qa-programme-v4" },
      select: { id: true },
    });
    const requirement = await prisma.qaRequirement.findFirstOrThrow({
      where: { code: "1.2", criterion: { frameworkId: framework.id } },
      select: { id: true },
    });
    const actor = await prisma.user.create({
      data: {
        email: `sar-part3-legacy-${suffix}@dse.invalid`,
        name: "SAR Part 3 Legacy Test Reviewer",
      },
    });
    const cycle = await prisma.qaAssessmentCycle.create({
      data: {
        programmeId: programme.id,
        frameworkId: framework.id,
        title: `SAR Part 3 legacy ${suffix}`,
        reportingStart: new Date("2026-01-01T00:00:00.000Z"),
        reportingEnd: new Date("2026-12-31T00:00:00.000Z"),
        createdById: actor.id,
      },
    });

    await prisma.qaRequirementAssessment.create({
      data: {
        programmeId: programme.id,
        cycleId: cycle.id,
        requirementId: requirement.id,
        rating: 3,
        narrative: "Legacy human self-assessment before additional programme review.",
        reviewerId: actor.id,
      },
    });
    await prisma.qaRequirementAssessment.update({
      where: {
        cycleId_requirementId: {
          cycleId: cycle.id,
          requirementId: requirement.id,
        },
      },
      data: {
        rating: 4,
        narrative: "Legacy human self-assessment revised after additional programme review.",
      },
    });

    const history = await prisma.$queryRaw<
      Array<{ revisionNumber: number; rating: number | null; justification: string }>
    >`
      SELECT "revisionNumber", "rating", "justification"
      FROM "QaSarBookRequirementRatingRevision"
      WHERE "cycleId" = ${cycle.id}
        AND "requirementId" = ${requirement.id}
      ORDER BY "revisionNumber"
    `;

    expect(history).toHaveLength(2);
    expect(history.map((row) => row.revisionNumber)).toEqual([1, 2]);
    expect(history.map((row) => row.rating)).toEqual([3, 4]);
    expect(history[0]?.justification).toContain("before additional programme review");
    expect(history[1]?.justification).toContain("revised after additional programme review");
  });
});
