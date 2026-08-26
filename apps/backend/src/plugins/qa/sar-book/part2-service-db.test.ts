import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { AUN_QA_V4_ID } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { saveQaSarSection } from "../sar/service.ts";
import {
  reviewQaSarSubmission,
  reviseApprovedQaSarSection,
  submitQaSarSection,
} from "../sar-review/service.ts";
import { getQaSarBookPart2 } from "./part2-service.ts";

const dbDescribe = process.env.BACKEND_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function document(text: string) {
  return {
    version: 1 as const,
    blocks: [{ id: randomUUID(), type: "paragraph" as const, text }],
  };
}

const READY = {
  practiceDescribed: true,
  resultsAnalysed: true,
  improvementExplained: true,
};

dbDescribe("SAR book Part 2 database projection", () => {
  test("assembles AUN-QA v4 8/53 and pins approved content across later drafts", async () => {
    const programme = await prisma.programme.findFirstOrThrow({ select: { id: true } });
    const framework = await prisma.qaFramework.findUniqueOrThrow({
      where: { id: AUN_QA_V4_ID },
      select: {
        id: true,
        criteria: {
          orderBy: { order: "asc" },
          take: 1,
          select: {
            requirements: {
              orderBy: { order: "asc" },
              take: 1,
              select: { code: true },
            },
          },
        },
      },
    });
    const requirementCode = framework.criteria[0]?.requirements[0]?.code;
    if (!requirementCode) throw new Error("Seeded AUN-QA v4 framework has no requirement");

    const [author, reviewer] = await Promise.all([
      prisma.user.create({
        data: {
          email: `part2-author-${randomUUID()}@dse.invalid`,
          name: "Part 2 Test Author",
        },
      }),
      prisma.user.create({
        data: {
          email: `part2-reviewer-${randomUUID()}@dse.invalid`,
          name: "Part 2 Test Reviewer",
        },
      }),
    ]);

    const cycle = await prisma.qaAssessmentCycle.create({
      data: {
        programmeId: programme.id,
        frameworkId: framework.id,
        title: `Part 2 projection ${randomUUID()}`,
        reportingStart: new Date("2026-01-01T00:00:00.000Z"),
        reportingEnd: new Date("2026-12-31T00:00:00.000Z"),
        createdById: author.id,
      },
    });

    const initialProjection = await getQaSarBookPart2(programme.id, cycle.id);
    expect(initialProjection.criteria).toHaveLength(8);
    expect(initialProjection.totals.total).toBe(53);
    expect(initialProjection.criteria.map((criterion) => criterion.criterionCode)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8",
    ]);
    expect(initialProjection.totals.notStarted).toBe(53);

    await saveQaSarSection(
      cycle.id,
      requirementCode,
      { programmeId: programme.id, content: document("Approved narrative v1"), readiness: READY },
      author.id,
    );
    const submitted = await submitQaSarSection(
      programme.id,
      cycle.id,
      requirementCode,
      author.id,
    );
    await reviewQaSarSubmission(
      submitted.id,
      { programmeId: programme.id, decision: "approved", comment: "Approved for test" },
      reviewer.id,
    );

    const approvedProjection = await getQaSarBookPart2(programme.id, cycle.id);
    const approvedRequirement = approvedProjection.criteria
      .flatMap((criterion) => criterion.requirements)
      .find((requirement) => requirement.requirementCode === requirementCode);
    expect(approvedRequirement?.workflowStatus).toBe("approved");
    expect(approvedRequirement?.officialPin).toEqual({
      submissionId: submitted.id,
      submissionVersion: submitted.version,
    });
    expect(approvedRequirement?.approvedSubmission?.plainText).toContain("Approved narrative v1");

    await reviseApprovedQaSarSection(programme.id, cycle.id, requirementCode);
    await saveQaSarSection(
      cycle.id,
      requirementCode,
      { programmeId: programme.id, content: document("New mutable draft v2"), readiness: READY },
      author.id,
    );

    const revisedProjection = await getQaSarBookPart2(programme.id, cycle.id);
    const revisedRequirement = revisedProjection.criteria
      .flatMap((criterion) => criterion.requirements)
      .find((requirement) => requirement.requirementCode === requirementCode);
    expect(revisedRequirement?.workflowStatus).toBe("draft");
    expect(revisedRequirement?.currentSource?.plainText).toContain("New mutable draft v2");
    expect(revisedRequirement?.officialPin).toEqual({
      submissionId: submitted.id,
      submissionVersion: submitted.version,
    });
    expect(revisedRequirement?.approvedSubmission?.plainText).toContain("Approved narrative v1");
  });
});
