import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { PortalCourseDetail } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import {
  applyProvisionalResultAccessPolicy,
  getOfferingResultAccessPolicy,
  setOfferingResultAccessPolicy,
} from "./result-access-policy.ts";
import { PortalAccessError, PortalNotFoundError } from "./service.ts";

const runDbTests = process.env.RESULT_ACCESS_POLICY_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

dbDescribe("provisional result access policy", () => {
  test("authorizes offering staff and keeps finalized/corrected-finalized results visible while provisional results stay locked", async () => {
    const suffix = randomUUID();
    const primary = await prisma.user.create({
      data: { email: `pr289-primary-${suffix}@dse.invalid`, name: "PR 289 Primary" },
    });
    const coLecturer = await prisma.user.create({
      data: { email: `pr289-co-${suffix}@dse.invalid`, name: "PR 289 Co Lecturer" },
    });
    const unrelated = await prisma.user.create({
      data: { email: `pr289-unrelated-${suffix}@dse.invalid`, name: "PR 289 Unrelated" },
    });
    const spec = await prisma.courseSpec.findFirstOrThrow({
      where: { reviewStatus: "Approved" },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      select: { id: true, courseId: true },
    });
    const offering = await prisma.offering.create({
      data: {
        courseId: spec.courseId,
        courseSpecId: spec.id,
        lecturerId: primary.id,
        term: `pr289-${suffix}`,
        sectionCode: `P289-${suffix.slice(0, 8)}`,
        capacity: 10,
        status: "Active",
      },
    });
    await prisma.offeringCoLecturer.create({
      data: { offeringId: offering.id, lecturerId: coLecturer.id },
    });

    expect(await getOfferingResultAccessPolicy(offering.id, primary.id, false)).toEqual({
      offeringId: offering.id,
      requireSurveyBeforeResults: false,
    });
    await setOfferingResultAccessPolicy(offering.id, coLecturer.id, false, true);
    expect(await getOfferingResultAccessPolicy(offering.id, primary.id, false)).toEqual({
      offeringId: offering.id,
      requireSurveyBeforeResults: true,
    });
    await expect(
      getOfferingResultAccessPolicy(offering.id, unrelated.id, false),
    ).rejects.toBeInstanceOf(PortalAccessError);
    await expect(
      setOfferingResultAccessPolicy(offering.id, unrelated.id, false, false),
    ).rejects.toBeInstanceOf(PortalAccessError);
    await expect(
      getOfferingResultAccessPolicy(randomUUID(), primary.id, false),
    ).rejects.toBeInstanceOf(PortalNotFoundError);

    const student = await prisma.student.create({
      data: {
        name: "PR 289 Student",
        email: `pr289-student-${suffix}@dse.invalid`,
        studentId: `P289-${suffix}`,
        status: "Active",
      },
    });
    const enrollment = await prisma.enrollment.create({
      data: { offeringId: offering.id, studentId: student.id },
    });
    const publishedAt = new Date("2026-08-17T00:00:00.000Z");
    const finalizedAt = new Date("2026-08-17T00:10:00.000Z");
    const finalizedAssessmentId = `final-${suffix}`;
    const provisionalAssessmentId = `provisional-${suffix}`;

    const finalizedResult = await prisma.assessmentResult.create({
      data: {
        enrollmentId: enrollment.id,
        courseSpecId: spec.id,
        assessmentItemId: finalizedAssessmentId,
        score: 80,
        maxScore: 100,
        feedback: "Finalized result",
        publishedAt,
        publishedById: primary.id,
        finalizedAt,
        finalizedById: primary.id,
      },
    });
    await prisma.assessmentResultCorrection.create({
      data: {
        assessmentResultId: finalizedResult.id,
        beforeScore: 78,
        beforeMaxScore: 100,
        beforeFeedback: "Before moderation",
        afterScore: 80,
        afterMaxScore: 100,
        afterFeedback: "Finalized result",
        reason: "Moderation correction fixture",
        correctedById: primary.id,
      },
    });
    await prisma.assessmentResult.create({
      data: {
        enrollmentId: enrollment.id,
        courseSpecId: spec.id,
        assessmentItemId: provisionalAssessmentId,
        score: 90,
        maxScore: 100,
        feedback: "Provisional result",
        publishedAt,
        publishedById: primary.id,
      },
    });

    const detail: PortalCourseDetail = {
      offeringId: offering.id,
      enrollmentId: enrollment.id,
      courseId: spec.courseId,
      code: "P289",
      title: "Result gate fixture",
      description: null,
      credits: 3,
      term: offering.term,
      sectionCode: offering.sectionCode,
      lifecycle: "current",
      lecturer: null,
      coLecturers: [],
      meetings: [],
      specAvailable: true,
      nextAssessment: null,
      clos: [{ code: "CLO1", description: "Fixture CLO", level: null, mappedPlos: [] }],
      weeks: [],
      assessments: [
        {
          id: finalizedAssessmentId,
          name: "Finalized assessment",
          type: "Exam",
          description: "",
          mode: "individual",
          cloCodes: ["CLO1"],
          weight: 50,
          countsTowardGrade: true,
          courseGradeWeight: 50,
          dueAt: null,
          dueWeek: null,
          format: "",
          submissionMethod: "",
          instructions: "",
          rubricName: "",
          result: {
            assessmentItemId: finalizedAssessmentId,
            score: 80,
            maxScore: 100,
            percentage: 80,
            weightedCourseContribution: 40,
            feedback: "Finalized result",
            publishedAt: publishedAt.toISOString(),
            criterionEvidence: [],
          },
        },
        {
          id: provisionalAssessmentId,
          name: "Provisional assessment",
          type: "Project",
          description: "",
          mode: "individual",
          cloCodes: ["CLO1"],
          weight: 50,
          countsTowardGrade: true,
          courseGradeWeight: 50,
          dueAt: null,
          dueWeek: null,
          format: "",
          submissionMethod: "",
          instructions: "",
          rubricName: "",
          result: {
            assessmentItemId: provisionalAssessmentId,
            score: 90,
            maxScore: 100,
            percentage: 90,
            weightedCourseContribution: 45,
            feedback: "Provisional result",
            publishedAt: publishedAt.toISOString(),
            criterionEvidence: [],
          },
        },
      ],
      resources: [],
      totalCourseGrade: 85,
      courseGradeComplete: true,
      completedGradeWeight: 100,
      configuredGradeWeight: 100,
      achievements: [{
        code: "CLO1",
        description: "Fixture CLO",
        percentage: 85,
        status: "achieved",
        evidenceCount: 2,
        evidence: [
          {
            assessmentItemId: finalizedAssessmentId,
            assessmentName: "Finalized assessment",
            rawPercentage: 80,
            source: "assessment",
          },
          {
            assessmentItemId: provisionalAssessmentId,
            assessmentName: "Provisional assessment",
            rawPercentage: 90,
            source: "assessment",
          },
        ],
      }],
      overallAchievement: 85,
      feedbackSubmitted: false,
    };

    const gated = await applyProvisionalResultAccessPolicy(offering.id, detail);
    expect(gated.assessments[0]?.result?.score).toBe(80);
    expect(gated.assessments[1]?.result).toBeNull();
    expect(gated.completedGradeWeight).toBe(50);
    expect(gated.courseGradeComplete).toBe(false);
    expect(gated.totalCourseGrade).toBeNull();
    expect(gated.achievements[0]).toMatchObject({
      percentage: 80,
      evidenceCount: 1,
      status: "achieved",
    });
    expect(gated.achievements[0]?.evidence[0]?.assessmentItemId).toBe(finalizedAssessmentId);
    expect(gated.overallAchievement).toBe(80);
    expect(gated.provisionalResultAccess).toEqual({
      requireSurveyBeforeResults: true,
      surveyCompleted: false,
      canViewProvisionalResults: false,
      hiddenProvisionalAssessmentCount: 1,
    });

    const unlocked = await applyProvisionalResultAccessPolicy(offering.id, {
      ...detail,
      feedbackSubmitted: true,
    });
    expect(unlocked.assessments[0]?.result?.score).toBe(80);
    expect(unlocked.assessments[1]?.result?.score).toBe(90);
    expect(unlocked.provisionalResultAccess?.canViewProvisionalResults).toBe(true);
  });
});
