import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { groupAssessmentService } from "./group-assessment-results.ts";
import { resultsLifecycleService } from "./results-lifecycle.ts";
import { PortalConflictError, studentPortalService } from "./service.ts";

process.env.JWT_SECRET ??= "group-assessment-e2e-test-secret-at-least-32-characters";

const runDbTests = process.env.GROUP_ASSESSMENT_E2E_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

dbDescribe("Group and Group + Individual end-to-end lifecycle integrity", () => {
  test("materializes, publishes, finalizes, source-corrects, and preserves propagated correction history", async () => {
    const suffix = randomUUID();
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const baseSpec = await prisma.courseSpec.findFirstOrThrow({
      where: { reviewStatus: "Approved" },
      include: { course: true },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
    });
    const maxVersion = await prisma.courseSpec.findFirstOrThrow({
      where: { courseId: baseSpec.courseId },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      select: { versionMajor: true },
    });

    const groupAssessmentId = `e2e-group-${suffix}`;
    const groupIndividualAssessmentId = `e2e-group-individual-${suffix}`;
    const spec = await prisma.courseSpec.create({
      data: {
        courseId: baseSpec.courseId,
        versionMajor: maxVersion.versionMajor + 1,
        versionMinor: 0,
        revisionType: "Major",
        revisionTriggers: ["ProgrammeCoordinator"],
        revisionReason: "Post-merge group assessment lifecycle verification",
        changeSummary: "Isolated E2E verification fixture",
        reviewStatus: "Approved",
        approvedAt: new Date(),
        assessmentItems: {
          create: [
            {
              id: groupAssessmentId,
              order: 0,
              name: "E2E Group Assessment",
              type: "Project",
              mode: "Group",
              status: "Active",
              weight: 50,
            },
            {
              id: groupIndividualAssessmentId,
              order: 1,
              name: "E2E Group + Individual Assessment",
              type: "Project + Defense",
              mode: "GroupIndividual",
              groupWeight: 70,
              individualWeight: 30,
              status: "Active",
              weight: 50,
            },
          ],
        },
      },
    });

    const offering = await prisma.offering.create({
      data: {
        courseId: baseSpec.courseId,
        courseSpecId: spec.id,
        lecturerId: actor.id,
        term: `group-e2e-${suffix}`,
        sectionCode: "A",
        status: "Active",
      },
    });

    const studentUserA = await prisma.user.create({
      data: { email: `group-e2e-a-${suffix}@dse.invalid`, name: "Group E2E Student A" },
    });
    const studentUserB = await prisma.user.create({
      data: { email: `group-e2e-b-${suffix}@dse.invalid`, name: "Group E2E Student B" },
    });
    const studentA = await prisma.student.create({
      data: {
        name: "Group E2E Student A",
        email: `group-e2e-profile-a-${suffix}@dse.invalid`,
        studentId: `GE2E-A-${suffix}`,
        status: "Active",
        userId: studentUserA.id,
      },
    });
    const studentB = await prisma.student.create({
      data: {
        name: "Group E2E Student B",
        email: `group-e2e-profile-b-${suffix}@dse.invalid`,
        studentId: `GE2E-B-${suffix}`,
        status: "Active",
        userId: studentUserB.id,
      },
    });
    const enrollmentA = await prisma.enrollment.create({
      data: { offeringId: offering.id, studentId: studentA.id },
    });
    const enrollmentB = await prisma.enrollment.create({
      data: { offeringId: offering.id, studentId: studentB.id },
    });
    const enrollmentIds = [enrollmentA.id, enrollmentB.id];

    // GROUP: configure -> score/materialize -> publish -> finalize -> source correction.
    let groupWorkspace = await groupAssessmentService.replaceGroups(
      actor.id,
      false,
      offering.id,
      groupAssessmentId,
      { groups: [{ name: "Group A", enrollmentIds }] },
    );
    const groupId = groupWorkspace.groups[0]!.id;
    groupWorkspace = await groupAssessmentService.saveGroupScore(
      actor.id,
      false,
      offering.id,
      groupAssessmentId,
      groupId,
      { score: 16, maxScore: 20, feedback: "Original group score" },
    );
    expect(groupWorkspace.readiness.readyToPublish).toBe(true);

    const groupDraftResults = await prisma.assessmentResult.findMany({
      where: { courseSpecId: spec.id, assessmentItemId: groupAssessmentId },
      orderBy: { enrollmentId: "asc" },
    });
    expect(groupDraftResults).toHaveLength(2);
    expect(groupDraftResults.map((row) => [row.score, row.maxScore])).toEqual([[16, 20], [16, 20]]);
    expect(groupDraftResults.every((row) => row.publishedAt === null && row.finalizedAt === null)).toBe(true);

    await resultsLifecycleService.publishAssessment(actor.id, false, {
      offeringId: offering.id,
      assessmentItemId: groupAssessmentId,
    });
    await resultsLifecycleService.finalizeAssessment(actor.id, false, {
      offeringId: offering.id,
      assessmentItemId: groupAssessmentId,
    });

    groupWorkspace = await groupAssessmentService.workspace(actor.id, false, offering.id, groupAssessmentId);
    const finalizedGroup = groupWorkspace.groups[0]!;
    expect(finalizedGroup.publishedAt).not.toBeNull();
    expect(finalizedGroup.finalizedAt).not.toBeNull();
    await groupAssessmentService.correctGroupScore(
      actor.id,
      false,
      offering.id,
      groupAssessmentId,
      groupId,
      {
        score: 18,
        maxScore: 20,
        feedback: "Corrected group score",
        reason: "Moderation corrected the shared group mark",
        expectedUpdatedAt: finalizedGroup.score!.updatedAt,
      },
    );

    const correctedGroupResults = await prisma.assessmentResult.findMany({
      where: { courseSpecId: spec.id, assessmentItemId: groupAssessmentId },
      include: { corrections: { orderBy: { createdAt: "asc" } } },
      orderBy: { enrollmentId: "asc" },
    });
    expect(correctedGroupResults).toHaveLength(2);
    for (const result of correctedGroupResults) {
      expect(result.score).toBe(18);
      expect(result.maxScore).toBe(20);
      expect(result.publishedAt).not.toBeNull();
      expect(result.finalizedAt).not.toBeNull();
      expect(result.corrections).toHaveLength(1);
      expect(result.corrections[0]).toMatchObject({
        beforeScore: 16,
        beforeMaxScore: 20,
        afterScore: 18,
        afterMaxScore: 20,
        reason: "Group source correction: Moderation corrected the shared group mark",
        correctedById: actor.id,
      });
    }
    expect(await prisma.assessmentGroupScoreCorrection.count({
      where: { groupScore: { group: { courseSpecId: spec.id, assessmentItemId: groupAssessmentId } } },
    })).toBe(1);

    // GROUP + INDIVIDUAL: configure -> source components -> materialize -> publish/finalize.
    let combinedWorkspace = await groupAssessmentService.replaceGroups(
      actor.id,
      false,
      offering.id,
      groupIndividualAssessmentId,
      { groups: [{ name: "Combined Group A", enrollmentIds }] },
    );
    const combinedGroupId = combinedWorkspace.groups[0]!.id;
    combinedWorkspace = await groupAssessmentService.saveGroupScore(
      actor.id,
      false,
      offering.id,
      groupIndividualAssessmentId,
      combinedGroupId,
      { score: 80, maxScore: 100, feedback: "Original combined group score" },
    );
    combinedWorkspace = await groupAssessmentService.saveIndividualComponent(
      actor.id,
      false,
      offering.id,
      groupIndividualAssessmentId,
      enrollmentA.id,
      {
        score: 60,
        maxScore: 100,
        feedback: "Student A original individual score",
        adjustmentPoints: 0,
        adjustmentReason: "",
      },
    );
    combinedWorkspace = await groupAssessmentService.saveIndividualComponent(
      actor.id,
      false,
      offering.id,
      groupIndividualAssessmentId,
      enrollmentB.id,
      {
        score: 90,
        maxScore: 100,
        feedback: "Student B original individual score",
        adjustmentPoints: 0,
        adjustmentReason: "",
      },
    );
    expect(combinedWorkspace.readiness.readyToPublish).toBe(true);

    const combinedDraftResults = await prisma.assessmentResult.findMany({
      where: { courseSpecId: spec.id, assessmentItemId: groupIndividualAssessmentId },
      orderBy: { enrollmentId: "asc" },
    });
    expect(combinedDraftResults).toHaveLength(2);
    const draftByEnrollment = new Map(combinedDraftResults.map((row) => [row.enrollmentId, row]));
    expect(draftByEnrollment.get(enrollmentA.id)?.score).toBeCloseTo(74, 8);
    expect(draftByEnrollment.get(enrollmentB.id)?.score).toBeCloseTo(83, 8);
    expect(combinedDraftResults.every((row) => row.maxScore === 100)).toBe(true);

    await resultsLifecycleService.publishAssessment(actor.id, false, {
      offeringId: offering.id,
      assessmentItemId: groupIndividualAssessmentId,
    });
    await resultsLifecycleService.finalizeAssessment(actor.id, false, {
      offeringId: offering.id,
      assessmentItemId: groupIndividualAssessmentId,
    });

    combinedWorkspace = await groupAssessmentService.workspace(
      actor.id,
      false,
      offering.id,
      groupIndividualAssessmentId,
    );
    const finalizedCombinedGroup = combinedWorkspace.groups[0]!;
    await groupAssessmentService.correctGroupScore(
      actor.id,
      false,
      offering.id,
      groupIndividualAssessmentId,
      combinedGroupId,
      {
        score: 90,
        maxScore: 100,
        feedback: "Corrected combined group score",
        reason: "Moderation increased the shared group component",
        expectedUpdatedAt: finalizedCombinedGroup.score!.updatedAt,
      },
    );

    const afterGroupCorrectionResults = await prisma.assessmentResult.findMany({
      where: { courseSpecId: spec.id, assessmentItemId: groupIndividualAssessmentId },
      include: { corrections: { orderBy: { createdAt: "asc" } } },
    });
    const afterGroupCorrectionByEnrollment = new Map(
      afterGroupCorrectionResults.map((row) => [row.enrollmentId, row]),
    );
    expect(afterGroupCorrectionByEnrollment.get(enrollmentA.id)?.score).toBeCloseTo(81, 8);
    expect(afterGroupCorrectionByEnrollment.get(enrollmentB.id)?.score).toBeCloseTo(90, 8);
    expect(afterGroupCorrectionByEnrollment.get(enrollmentA.id)?.corrections).toHaveLength(1);
    expect(afterGroupCorrectionByEnrollment.get(enrollmentB.id)?.corrections).toHaveLength(1);

    combinedWorkspace = await groupAssessmentService.workspace(
      actor.id,
      false,
      offering.id,
      groupIndividualAssessmentId,
    );
    const studentAComponent = combinedWorkspace.groups[0]!.individualComponents.find(
      (component) => component.enrollmentId === enrollmentA.id,
    )!;
    await groupAssessmentService.correctIndividualComponent(
      actor.id,
      false,
      offering.id,
      groupIndividualAssessmentId,
      enrollmentA.id,
      {
        score: 70,
        maxScore: 100,
        feedback: "Student A corrected individual score",
        adjustmentPoints: 0,
        adjustmentReason: "",
        reason: "Oral moderation increased Student A's individual component",
        expectedUpdatedAt: studentAComponent.updatedAt,
      },
    );

    const finalCombinedResults = await prisma.assessmentResult.findMany({
      where: { courseSpecId: spec.id, assessmentItemId: groupIndividualAssessmentId },
      include: { corrections: { orderBy: { createdAt: "asc" } } },
    });
    const finalCombinedByEnrollment = new Map(finalCombinedResults.map((row) => [row.enrollmentId, row]));
    const finalA = finalCombinedByEnrollment.get(enrollmentA.id)!;
    const finalB = finalCombinedByEnrollment.get(enrollmentB.id)!;
    expect(finalA.score).toBeCloseTo(84, 8);
    expect(finalB.score).toBeCloseTo(90, 8);
    expect(finalA.corrections).toHaveLength(2);
    expect(finalB.corrections).toHaveLength(1);
    expect(finalA.corrections.map((row) => [row.beforeScore, row.afterScore, row.reason])).toEqual([
      [74, 81, "Group source correction: Moderation increased the shared group component"],
      [81, 84, "Individual source correction: Oral moderation increased Student A's individual component"],
    ]);
    expect(finalB.corrections[0]).toMatchObject({
      beforeScore: 83,
      afterScore: 90,
      reason: "Group source correction: Moderation increased the shared group component",
    });

    expect(await prisma.assessmentGroupScoreCorrection.count({
      where: { groupScore: { group: { courseSpecId: spec.id, assessmentItemId: groupIndividualAssessmentId } } },
    })).toBe(1);
    expect(await prisma.assessmentIndividualComponentCorrection.count({
      where: { component: { courseSpecId: spec.id, assessmentItemId: groupIndividualAssessmentId } },
    })).toBe(1);

    // The old generic finalized-result correction route must remain blocked for derived rows.
    await expect(resultsLifecycleService.correctFinalized(actor.id, false, {
      assessmentResultId: finalA.id,
      score: 85,
      maxScore: 100,
      feedback: "Should never persist",
      reason: "Attempted generic bypass",
      expectedUpdatedAt: finalA.updatedAt.toISOString(),
    })).rejects.toBeInstanceOf(PortalConflictError);
    expect(await prisma.assessmentResultCorrection.count({ where: { assessmentResultId: finalA.id } })).toBe(2);

    const groupAuditActions = (await groupAssessmentService.workspace(
      actor.id,
      false,
      offering.id,
      groupAssessmentId,
    )).audit.map((row) => row.action);
    for (const action of ["GroupsConfigured", "MembershipLocked", "Published", "Finalized", "GroupScoreCorrected"]) {
      expect(groupAuditActions).toContain(action);
    }
    const combinedAuditActions = (await groupAssessmentService.workspace(
      actor.id,
      false,
      offering.id,
      groupIndividualAssessmentId,
    )).audit.map((row) => row.action);
    for (const action of [
      "GroupsConfigured",
      "MembershipLocked",
      "IndividualComponentSaved",
      "Published",
      "Finalized",
      "GroupScoreCorrected",
      "IndividualComponentCorrected",
    ]) {
      expect(combinedAuditActions).toContain(action);
    }

    // Final student-facing results must reflect source-corrected official marks.
    const studentViewA = await studentPortalService.course(studentUserA.id, offering.id);
    const studentViewB = await studentPortalService.course(studentUserB.id, offering.id);
    expect(studentViewA.assessments.find((item) => item.id === groupAssessmentId)?.result?.score).toBe(18);
    expect(studentViewB.assessments.find((item) => item.id === groupAssessmentId)?.result?.score).toBe(18);
    expect(studentViewA.assessments.find((item) => item.id === groupIndividualAssessmentId)?.result?.score).toBeCloseTo(84, 8);
    expect(studentViewB.assessments.find((item) => item.id === groupIndividualAssessmentId)?.result?.score).toBeCloseTo(90, 8);
  });
});
