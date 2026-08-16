import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { resultsLifecycleService } from "./results-lifecycle.ts";
import { PortalAccessError, PortalConflictError, studentPortalService } from "./service.ts";

process.env.JWT_SECRET ??= "issue-333-result-correction-test-secret-at-least-32-characters";

const runDbTests = process.env.RESULT_CORRECTION_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

async function expectDatabaseRejection(operation: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}

dbDescribe("finalized result correction database integrity", () => {
  test("corrects finalized marks append-only while preserving official provenance and roster context", async () => {
    const suffix = randomUUID();
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const unrelated = await prisma.user.findFirstOrThrow({
      where: { id: { not: actor.id } },
      select: { id: true },
    });
    const spec = await prisma.courseSpec.findFirstOrThrow({
      where: {
        reviewStatus: "Approved",
        assessmentItems: { some: { status: "Active" } },
      },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      include: { assessmentItems: { where: { status: "Active" }, orderBy: { order: "asc" } } },
    });
    const assessment = spec.assessmentItems[0];
    if (!assessment) throw new Error("Seeded approved CourseSpec needs an active assessment");

    const offering = await prisma.offering.create({
      data: {
        courseId: spec.courseId,
        lecturerId: actor.id,
        term: `issue333-${suffix}`,
        sectionCode: `I333-${suffix.slice(0, 8)}`,
        capacity: 10,
        status: "Active",
      },
    });

    const studentUser = await prisma.user.create({
      data: {
        email: `issue333-student-${suffix}@dse.invalid`,
        name: "Issue 333 Student",
      },
    });
    const student = await prisma.student.create({
      data: {
        name: "Issue 333 Student",
        email: `issue333-student-profile-${suffix}@dse.invalid`,
        studentId: `I333-${suffix}`,
        status: "Active",
        userId: studentUser.id,
      },
    });
    const secondStudent = await prisma.student.create({
      data: {
        name: "Issue 333 Non-finalized Student",
        email: `issue333-second-${suffix}@dse.invalid`,
        studentId: `I333-B-${suffix}`,
        status: "Active",
      },
    });
    const futureStudent = await prisma.student.create({
      data: {
        name: "Issue 333 Future Student",
        email: `issue333-future-${suffix}@dse.invalid`,
        studentId: `I333-C-${suffix}`,
        status: "Active",
      },
    });

    const enrollment = await prisma.enrollment.create({
      data: { offeringId: offering.id, studentId: student.id },
    });
    const nonFinalizedEnrollment = await prisma.enrollment.create({
      data: { offeringId: offering.id, studentId: secondStudent.id },
    });

    const publishedAt = new Date("2026-08-16T01:00:00.000Z");
    const finalizedAt = new Date("2026-08-16T02:00:00.000Z");
    const result = await prisma.assessmentResult.create({
      data: {
        enrollmentId: enrollment.id,
        courseSpecId: spec.id,
        assessmentItemId: assessment.id,
        score: 70,
        maxScore: 100,
        feedback: "Original official feedback",
        publishedAt,
        publishedById: actor.id,
      },
    });
    const criterion = await prisma.assessmentCriterionScore.create({
      data: {
        assessmentResultId: result.id,
        rubricId: "issue333-rubric",
        criterionId: "issue333-criterion",
        criterionName: "Historical criterion evidence",
        rubricContentHash: "issue333-content-hash",
        score: 3,
        maxScore: 4,
      },
    });
    const finalized = await prisma.assessmentResult.update({
      where: { id: result.id },
      data: { finalizedAt, finalizedById: actor.id },
    });

    const nonFinalized = await prisma.assessmentResult.create({
      data: {
        enrollmentId: nonFinalizedEnrollment.id,
        courseSpecId: spec.id,
        assessmentItemId: assessment.id,
        score: 65,
        maxScore: 100,
        feedback: "Published but not finalized",
        publishedAt,
        publishedById: actor.id,
      },
    });

    await expect(
      resultsLifecycleService.correctFinalized(unrelated.id, false, {
        assessmentResultId: finalized.id,
        score: 72,
        maxScore: 100,
        feedback: "Unauthorized attempt",
        reason: "Should not be authorized",
        expectedUpdatedAt: finalized.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(PortalAccessError);

    await expect(
      resultsLifecycleService.correctFinalized(actor.id, false, {
        assessmentResultId: nonFinalized.id,
        score: 66,
        maxScore: 100,
        feedback: "Not official yet",
        reason: "Should be rejected",
        expectedUpdatedAt: nonFinalized.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(PortalConflictError);

    const corrected = await resultsLifecycleService.correctFinalized(actor.id, false, {
      assessmentResultId: finalized.id,
      score: 82,
      maxScore: 100,
      feedback: "Corrected after moderation review",
      reason: "Moderation identified a transcription error",
      expectedUpdatedAt: finalized.updatedAt.toISOString(),
    });

    const stored = await prisma.assessmentResult.findUniqueOrThrow({ where: { id: finalized.id } });
    expect(stored).toMatchObject({
      score: 82,
      maxScore: 100,
      feedback: "Corrected after moderation review",
      publishedById: actor.id,
      finalizedById: actor.id,
    });
    expect(stored.publishedAt?.toISOString()).toBe(publishedAt.toISOString());
    expect(stored.finalizedAt?.toISOString()).toBe(finalizedAt.toISOString());
    expect(corrected.updatedAt).toBe(stored.updatedAt.toISOString());

    const history = await prisma.assessmentResultCorrection.findMany({
      where: { assessmentResultId: finalized.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: corrected.correctionId,
      assessmentResultId: finalized.id,
      beforeScore: 70,
      beforeMaxScore: 100,
      beforeFeedback: "Original official feedback",
      afterScore: 82,
      afterMaxScore: 100,
      afterFeedback: "Corrected after moderation review",
      reason: "Moderation identified a transcription error",
      correctedById: actor.id,
    });

    const criterionAfter = await prisma.assessmentCriterionScore.findUniqueOrThrow({
      where: { id: criterion.id },
    });
    expect(criterionAfter).toMatchObject({ score: 3, maxScore: 4 });

    await expect(
      resultsLifecycleService.correctFinalized(actor.id, false, {
        assessmentResultId: finalized.id,
        score: 84,
        maxScore: 100,
        feedback: "Stale overwrite attempt",
        reason: "A second correction from an out-of-date screen",
        expectedUpdatedAt: finalized.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(PortalConflictError);
    expect(await prisma.assessmentResultCorrection.count({ where: { assessmentResultId: finalized.id } })).toBe(1);

    await expectDatabaseRejection(() =>
      prisma.assessmentResultCorrection.update({
        where: { id: history[0]!.id },
        data: { reason: "Rewritten history" },
      }),
    );
    await expectDatabaseRejection(() =>
      prisma.assessmentResultCorrection.delete({ where: { id: history[0]!.id } }),
    );
    await expectDatabaseRejection(() =>
      prisma.assessmentCriterionScore.update({
        where: { id: criterion.id },
        data: { score: 4 },
      }),
    );
    await expectDatabaseRejection(() =>
      prisma.assessmentResult.update({
        where: { id: finalized.id },
        data: { score: 81 },
      }),
    );
    await expectDatabaseRejection(() =>
      prisma.assessmentResult.update({
        where: { id: finalized.id },
        data: { score: 101 },
      }),
    );
    await expectDatabaseRejection(() =>
      prisma.enrollment.delete({ where: { id: enrollment.id } }),
    );
    await expectDatabaseRejection(() =>
      prisma.enrollment.create({
        data: { offeringId: offering.id, studentId: futureStudent.id },
      }),
    );

    const studentView = await studentPortalService.course(studentUser.id, offering.id);
    const visible = studentView.assessments.find((item) => item.id === assessment.id)?.result;
    expect(visible?.score).toBe(82);
    expect(visible?.feedback).toBe("Corrected after moderation review");
    const serialized = JSON.stringify(studentView);
    expect(serialized).not.toContain("Moderation identified a transcription error");
    expect(serialized).not.toContain("correctionId");
    expect(serialized).not.toContain("correctedById");
  });
});
