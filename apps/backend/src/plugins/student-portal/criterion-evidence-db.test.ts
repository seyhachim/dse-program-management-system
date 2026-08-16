import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { prisma } from "../../core/db/prisma.ts";
import { courseSpecRevisionService } from "../courses/revision-service.ts";

const runDbTests = process.env.CRITERION_EVIDENCE_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

const OPEN_REVIEW_STATUSES = [
  "Draft",
  "Submitted",
  "UnderReview",
  "ChangesRequested",
  "Resubmitted",
] as const;

dbDescribe("criterion scoring database integrity", () => {
  let assessmentResultId = "";
  let createdAssessmentResult = false;

  beforeAll(async () => {
    const enrollment = await prisma.enrollment.findFirst({
      select: {
        id: true,
        offering: { select: { courseId: true } },
      },
    });
    if (!enrollment) throw new Error("Seeded integration database has no enrollment");

    const spec = await prisma.courseSpec.findFirst({
      where: {
        courseId: enrollment.offering.courseId,
        reviewStatus: "Approved",
      },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      include: { assessmentItems: { orderBy: { order: "asc" } } },
    });
    const assessment = spec?.assessmentItems[0];
    if (!spec || !assessment) {
      throw new Error("Seeded integration database needs an approved specification assessment");
    }

    const key = {
      enrollmentId: enrollment.id,
      courseSpecId: spec.id,
      assessmentItemId: assessment.id,
    };
    const existing = await prisma.assessmentResult.findUnique({
      where: { enrollmentId_courseSpecId_assessmentItemId: key },
      select: { id: true },
    });
    if (existing) {
      assessmentResultId = existing.id;
      return;
    }

    const result = await prisma.assessmentResult.create({
      data: {
        ...key,
        score: 1,
        maxScore: 1,
        feedback: "Issue #282 DB invariant fixture",
      },
      select: { id: true },
    });
    assessmentResultId = result.id;
    createdAssessmentResult = true;
  });

  afterAll(async () => {
    if (assessmentResultId) {
      await prisma.assessmentCriterionScore.deleteMany({
        where: { assessmentResultId },
      });
    }
    if (createdAssessmentResult && assessmentResultId) {
      await prisma.assessmentResult.delete({ where: { id: assessmentResultId } });
    }
    await prisma.$disconnect();
  });

  test("database rejects negative, zero-max, and above-max criterion scores", async () => {
    const base = {
      assessmentResultId,
      rubricId: "issue-282-db-rubric",
      criterionName: "Database invariant criterion",
      rubricContentHash: "issue-282-db-content-hash",
    };

    await expect(
      prisma.assessmentCriterionScore.create({
        data: { ...base, criterionId: "negative", score: -0.1, maxScore: 4 },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.assessmentCriterionScore.create({
        data: { ...base, criterionId: "zero-max", score: 0, maxScore: 0 },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.assessmentCriterionScore.create({
        data: { ...base, criterionId: "above-max", score: 4.1, maxScore: 4 },
      }),
    ).rejects.toThrow();

    const valid = await prisma.assessmentCriterionScore.create({
      data: { ...base, criterionId: "valid", score: 3, maxScore: 4 },
      select: { id: true, score: true, maxScore: true },
    });
    expect(valid).toMatchObject({ score: 3, maxScore: 4 });
    await prisma.assessmentCriterionScore.delete({ where: { id: valid.id } });
  });

  test("course-spec revision preserves criterion-to-CLO provenance and remaps the assessment id", async () => {
    const approved = await prisma.courseSpec.findMany({
      where: { reviewStatus: "Approved" },
      orderBy: [{ courseId: "asc" }, { versionMajor: "desc" }, { versionMinor: "desc" }],
      include: { assessmentItems: { orderBy: { order: "asc" } } },
    });

    let source: (typeof approved)[number] | null = null;
    for (const candidate of approved) {
      if (candidate.assessmentItems.length === 0) continue;
      const openCount = await prisma.courseSpec.count({
        where: {
          courseId: candidate.courseId,
          reviewStatus: { in: [...OPEN_REVIEW_STATUSES] },
        },
      });
      if (openCount === 0) {
        source = candidate;
        break;
      }
    }
    if (!source) {
      throw new Error("Seeded database needs an approved course specification without an open revision");
    }

    const initiator = await prisma.user.findFirst({ select: { id: true } });
    const rubric = await prisma.rubric.findFirst({
      include: { criterionRows: { orderBy: { order: "asc" } }, levelRows: { orderBy: { order: "asc" } } },
    });
    const sourceAssessment = source.assessmentItems[0];
    const criterion = rubric?.criterionRows[0];
    if (!initiator || !rubric || !criterion || !sourceAssessment) {
      throw new Error("Seeded database needs a user, rubric criterion, and approved assessment");
    }

    const cloCode = sourceAssessment.cloCodes[0] ?? "CLO1";
    const sourceMapping = {
      courseSpecId: source.id,
      assessmentItemId: sourceAssessment.id,
      rubricId: rubric.id,
      criterionId: criterion.id,
      cloCode,
    };
    const existingMapping = await prisma.courseSpecCriterionCloMapping.findFirst({
      where: sourceMapping,
    });
    const criterionName = existingMapping?.criterionName ?? criterion.name;
    const contentHash = existingMapping?.rubricContentHash ?? "issue-282-historical-content-hash";
    let createdSourceMapping = false;
    if (!existingMapping) {
      await prisma.courseSpecCriterionCloMapping.create({
        data: {
          ...sourceMapping,
          criterionName,
          rubricContentHash: contentHash,
        },
      });
      createdSourceMapping = true;
    }

    let revisionId: string | null = null;
    try {
      const revision = await courseSpecRevisionService.createCourseSpecRevision({
        courseId: source.courseId,
        revisionType: "Minor",
        triggers: ["ProgrammeCoordinator"],
        reason: "Issue #282 provenance regression test",
        changeSummary: "Verify criterion evidence is copied without reinterpreting historical context",
        initiatedById: initiator.id,
      });
      revisionId = revision.id;

      const cloned = await prisma.courseSpecCriterionCloMapping.findFirst({
        where: {
          courseSpecId: revision.id,
          rubricId: sourceMapping.rubricId,
          criterionId: sourceMapping.criterionId,
          cloCode: sourceMapping.cloCode,
        },
      });
      expect(cloned).not.toBeNull();
      expect(cloned).toMatchObject({
        courseSpecId: revision.id,
        rubricId: sourceMapping.rubricId,
        criterionId: sourceMapping.criterionId,
        criterionName,
        rubricContentHash: contentHash,
        cloCode,
      });
      expect(cloned?.assessmentItemId).not.toBe(sourceAssessment.id);

      const clonedAssessment = await prisma.courseSpecAssessmentItem.findUnique({
        where: {
          courseSpecId_id: {
            courseSpecId: revision.id,
            id: cloned!.assessmentItemId,
          },
        },
        select: { courseSpecId: true },
      });
      expect(clonedAssessment?.courseSpecId).toBe(revision.id);
    } finally {
      if (revisionId) {
        await prisma.courseSpec.delete({ where: { id: revisionId } });
      }
      if (createdSourceMapping) {
        await prisma.courseSpecCriterionCloMapping.deleteMany({
          where: sourceMapping,
        });
      }
    }
  });
});
