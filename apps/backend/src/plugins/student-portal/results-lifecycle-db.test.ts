import { describe, expect, test } from "bun:test";
import { rubricService } from "../rubrics/service.ts";
import { rubricContentHash } from "../../core/academic/rubric-context.ts";
import { generateCloAttainmentSnapshots, MARKING_SCHEME_ATTAINMENT_VERSION } from "../qa/evidence/clo-attainment.ts";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { resultCorrectionsService } from "./result-corrections.ts";
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
    const coLecturer = await prisma.user.findFirstOrThrow({
      where: { id: { notIn: [actor.id, unrelated.id] } },
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
        courseSpecId: spec.id,
        lecturerId: actor.id,
        term: `issue333-${suffix}`,
        sectionCode: `I333-${suffix.slice(0, 8)}`,
        capacity: 10,
        status: "Active",
      },
    });
    await prisma.offeringCoLecturer.create({
      data: { offeringId: offering.id, lecturerId: coLecturer.id },
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

    const initialWorkspace = await resultCorrectionsService.workspace(actor.id, false, offering.id);
    expect(initialWorkspace.results).toHaveLength(1);
    expect(initialWorkspace.results[0]).toMatchObject({
      assessmentResultId: finalized.id,
      score: 70,
      correctionSummary: { count: 0, lastCorrectedAt: null, lastCorrectedByName: null },
    });

    const emptyHistory = await resultCorrectionsService.history(actor.id, false, finalized.id);
    expect(emptyHistory.corrections).toEqual([]);
    expect((await resultCorrectionsService.history(coLecturer.id, false, finalized.id)).corrections).toEqual([]);
    expect((await resultCorrectionsService.history(unrelated.id, true, finalized.id)).corrections).toEqual([]);
    await expect(
      resultCorrectionsService.history(unrelated.id, false, finalized.id),
    ).rejects.toBeInstanceOf(PortalAccessError);
    await expect(
      resultCorrectionsService.history(actor.id, false, nonFinalized.id),
    ).rejects.toBeInstanceOf(PortalConflictError);

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
    const correctedAgain = await resultsLifecycleService.correctFinalized(actor.id, false, {
      assessmentResultId: finalized.id,
      score: 84,
      maxScore: 100,
      feedback: "Corrected after second moderation review",
      reason: "Second moderation confirmed two additional marks",
      expectedUpdatedAt: corrected.updatedAt,
    });

    const stored = await prisma.assessmentResult.findUniqueOrThrow({ where: { id: finalized.id } });
    expect(stored).toMatchObject({
      score: 84,
      maxScore: 100,
      feedback: "Corrected after second moderation review",
      publishedById: actor.id,
      finalizedById: actor.id,
    });
    expect(stored.publishedAt?.toISOString()).toBe(publishedAt.toISOString());
    expect(stored.finalizedAt?.toISOString()).toBe(finalizedAt.toISOString());
    expect(correctedAgain.updatedAt).toBe(stored.updatedAt.toISOString());

    const history = await prisma.assessmentResultCorrection.findMany({
      where: { assessmentResultId: finalized.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history).toHaveLength(2);
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
    expect(history[1]).toMatchObject({
      id: correctedAgain.correctionId,
      assessmentResultId: finalized.id,
      beforeScore: 82,
      afterScore: 84,
      reason: "Second moderation confirmed two additional marks",
      correctedById: actor.id,
    });

    const staffHistory = await resultCorrectionsService.history(actor.id, false, finalized.id);
    expect(staffHistory.corrections).toHaveLength(2);
    expect(staffHistory.corrections.map((item) => item.correctionId)).toEqual([
      correctedAgain.correctionId,
      corrected.correctionId,
    ]);
    expect(staffHistory).toMatchObject({
      score: 84,
      maxScore: 100,
      feedback: "Corrected after second moderation review",
      publishedAt: publishedAt.toISOString(),
      finalizedAt: finalizedAt.toISOString(),
    });

    const correctedWorkspace = await resultCorrectionsService.workspace(actor.id, false, offering.id);
    expect(correctedWorkspace.results[0]).toMatchObject({
      assessmentResultId: finalized.id,
      score: 84,
      correctionSummary: { count: 2 },
    });
    expect(correctedWorkspace.results[0]?.correctionSummary.lastCorrectedAt).not.toBeNull();

    const criterionAfter = await prisma.assessmentCriterionScore.findUniqueOrThrow({
      where: { id: criterion.id },
    });
    expect(criterionAfter).toMatchObject({ score: 3, maxScore: 4 });

    await expect(
      resultsLifecycleService.correctFinalized(actor.id, false, {
        assessmentResultId: finalized.id,
        score: 86,
        maxScore: 100,
        feedback: "Stale overwrite attempt",
        reason: "A correction from an out-of-date screen",
        expectedUpdatedAt: corrected.updatedAt,
      }),
    ).rejects.toBeInstanceOf(PortalConflictError);
    expect(await prisma.assessmentResultCorrection.count({ where: { assessmentResultId: finalized.id } })).toBe(2);

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
    expect(visible?.score).toBe(84);
    expect(visible?.feedback).toBe("Corrected after second moderation review");
    const serialized = JSON.stringify(studentView);
    expect(serialized).not.toContain("Moderation identified a transcription error");
    expect(serialized).not.toContain("Second moderation confirmed two additional marks");
    expect(serialized).not.toContain("correctionId");
    expect(serialized).not.toContain("correctedById");
    expect(serialized).not.toContain("corrections");
  });
});


dbDescribe("marking scheme lifecycle integration", () => {
  test("authors a private scheme, persists exact marks and computes published/finalized CLO evidence", async () => {
    const suffix = randomUUID();
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const other = await prisma.user.findFirstOrThrow({ where: { id: { not: actor.id } }, select: { id: true } });
    const questions = [6, 6, 8, 5].map((maxPoints, i) => ({ id: randomUUID(), name: `Q${i + 1}`, maxPoints, descriptors: [] as string[] }));
    const rubric = await rubricService.create({ name: `Midterm ${suffix}`, type: "Exam", description: "", status: "Active", instrumentKind: "marking_scheme", levels: [], criteria: questions }, { id: actor.id, roles: ["lecturer"] });
    expect(await rubricService.getPublicById(rubric.id)).toBeNull();
    expect(await rubricService.getById(rubric.id, { id: other.id, roles: ["lecturer"] })).toBeNull();
    const instrument = await prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id }, include: { levelRows: true, criterionRows: true } });
    const hash = rubricContentHash(instrument);
    const course = await prisma.course.create({ data: { code: `I1355-${suffix.slice(0, 8)}`, title: "Marking scheme integration", programmeId: "dse" } });
    const spec = await prisma.courseSpec.create({ data: { courseId: course.id, versionMajor: 1, versionMinor: 0, revisionTriggers: [], reviewStatus: "Approved" } });
    for (let order = 0; order < 3; order++) await prisma.courseSpecClo.create({ data: { id: randomUUID(), courseSpecId: spec.id, order, description: `Outcome ${order + 1}` } });
    const assessment = await prisma.courseSpecAssessmentItem.create({ data: { id: randomUUID(), courseSpecId: spec.id, order: 0, name: "Midterm", type: "Exam", mode: "Individual", rubricId: rubric.id, weight: 25, cloCodes: ["CLO1", "CLO2", "CLO3"] } });
    await prisma.courseSpecCriterionCloMapping.createMany({ data: questions.map((q, i) => ({ courseSpecId: spec.id, assessmentItemId: assessment.id, rubricId: rubric.id, criterionId: q.id, criterionName: q.name, rubricContentHash: hash, cloCode: ["CLO1", "CLO1", "CLO2", "CLO3"][i]! })) });
    const offering = await prisma.offering.create({ data: { courseId: course.id, courseSpecId: spec.id, lecturerId: actor.id, term: `issue1355-${suffix}`, sectionCode: "A", capacity: 10, status: "Active" } });
    const student = await prisma.student.create({ data: { name: "Marking Scheme Student", email: `scheme-${suffix}@dse.invalid`, studentId: `I1355-${suffix}`, status: "Active" } });
    const enrollment = await prisma.enrollment.create({ data: { offeringId: offering.id, studentId: student.id } });
    const input = { enrollmentId: enrollment.id, assessmentItemId: assessment.id, scores: questions.map((q, i) => ({ criterionId: q.id, score: [5, 4, 7, 2][i]! })) };
    await expect(resultsLifecycleService.saveCriterionScores(other.id, false, input)).rejects.toBeInstanceOf(PortalAccessError);
    await expect(resultsLifecycleService.saveCriterionScores(actor.id, false, { ...input, scores: input.scores.slice(0, 3) })).rejects.toBeInstanceOf(PortalConflictError);
    await expect(resultsLifecycleService.saveCriterionScores(actor.id, false, { ...input, scores: [{ ...input.scores[0]!, score: 7 }, ...input.scores.slice(1)] })).rejects.toBeInstanceOf(PortalConflictError);
    await resultsLifecycleService.saveCriterionScores(actor.id, false, input);
    const result = await prisma.assessmentResult.findFirstOrThrow({ where: { enrollmentId: enrollment.id, assessmentItemId: assessment.id }, include: { criterionScores: true } });
    expect(result).toMatchObject({ score: 18, maxScore: 25, publishedAt: null });
    expect(result.criterionScores).toHaveLength(4);
    const review = await resultsLifecycleService.review(actor.id, false, offering.id);
    expect(review.rows[0]?.achievements.map((clo) => clo.percentage)).toEqual([75, 88, 40]);
    const selection = { offeringId: offering.id, assessmentItemId: assessment.id };
    await resultsLifecycleService.publishAssessment(actor.id, false, selection);
    await expect(resultsLifecycleService.saveCriterionScores(actor.id, false, input)).rejects.toBeInstanceOf(PortalConflictError);
    await resultsLifecycleService.finalizeAssessment(actor.id, false, selection);
    const snapshots = await generateCloAttainmentSnapshots({ programmeId: "dse", offeringId: offering.id, thresholdPercentage: 70 });
    expect(snapshots.map((snapshot) => snapshot.achievedRate)).toEqual([100, 100, 0]);
    expect(snapshots.every((snapshot) => snapshot.calculationVersion === MARKING_SCHEME_ATTAINMENT_VERSION)).toBe(true);
    const official = await prisma.assessmentResult.findUniqueOrThrow({ where: { id: result.id }, include: { criterionScores: true } });
    const correction = { assessmentResultId: result.id, score: 20, maxScore: 25, feedback: "Corrected Q4", reason: "Second marking verified two more points", expectedUpdatedAt: official.updatedAt.toISOString(), questionScores: questions.map((q, i) => ({ criterionId: q.id, score: [5, 4, 7, 4][i]! })) };
    await expect(resultsLifecycleService.correctFinalized(other.id, false, correction)).rejects.toBeInstanceOf(PortalAccessError);
    await expect(resultsLifecycleService.correctFinalized(actor.id, false, { ...correction, questionScores: undefined })).rejects.toBeInstanceOf(PortalConflictError);
    await expect(resultsLifecycleService.correctFinalized(actor.id, false, { ...correction, score: 21 })).rejects.toBeInstanceOf(PortalConflictError);
    await expectDatabaseRejection(() => prisma.assessmentCriterionScore.update({ where: { id: official.criterionScores[0]!.id }, data: { score: 0 } }));
    const corrected = await resultsLifecycleService.correctFinalized(actor.id, false, correction);
    expect(corrected.score).toBe(20);
    await expect(resultsLifecycleService.correctFinalized(actor.id, false, correction)).rejects.toBeInstanceOf(PortalConflictError);
    const history = await resultCorrectionsService.history(actor.id, false, result.id);
    expect(history.corrections[0]?.questionChanges).toEqual([expect.objectContaining({ criterionId: questions[3]!.id, beforeScore: 2, afterScore: 4, maxScore: 5 })]);
    expect(history.finalizedAt).toBe(official.finalizedAt?.toISOString());
    const correctedReview = await resultsLifecycleService.review(actor.id, false, offering.id);
    expect(correctedReview.rows[0]?.achievements.map((clo) => clo.percentage)).toEqual([75, 88, 80]);
    const revisedSnapshots = await generateCloAttainmentSnapshots({ programmeId: "dse", offeringId: offering.id, thresholdPercentage: 70 });
    expect(revisedSnapshots.map((snapshot) => snapshot.achievedRate)).toEqual([100, 100, 100]);
    expect(revisedSnapshots[2]?.supersedesSnapshotId).toBe(snapshots[2]?.id);
    expect((await prisma.qaCloAttainmentSnapshot.findUniqueOrThrow({ where: { id: snapshots[2]!.id } })).achievedRate).toBe(0);

  });
});
