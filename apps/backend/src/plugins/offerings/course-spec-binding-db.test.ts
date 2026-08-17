import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { studentPortalService } from "../student-portal/service.ts";
import { resultsLifecycleService } from "../student-portal/results-lifecycle.ts";

process.env.JWT_SECRET ??= "issue-211-course-spec-binding-test-secret-at-least-32-characters";

const runDbTests = process.env.OFFERING_COURSE_SPEC_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

async function rejected(operation: () => Promise<unknown>) {
  let didReject = false;
  try { await operation(); } catch { didReject = true; }
  expect(didReject).toBe(true);
}

dbDescribe("Offering exact CourseSpec version integrity", () => {
  test("keeps historical lecturer/student reads on the bound version after a newer approval", async () => {
    const suffix = randomUUID();
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const baseSpec = await prisma.courseSpec.findFirstOrThrow({
      where: { reviewStatus: "Approved", assessmentItems: { some: { status: "Active" } } },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      include: { course: true, assessmentItems: { where: { status: "Active" }, orderBy: { order: "asc" } } },
    });
    const baseAssessment = baseSpec.assessmentItems[0]!;
    const maxVersion = await prisma.courseSpec.findFirstOrThrow({
      where: { courseId: baseSpec.courseId },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      select: { versionMajor: true },
    });
    const futureAssessmentId = `issue-211-future-${suffix}`;
    const newerSpec = await prisma.courseSpec.create({
      data: {
        courseId: baseSpec.courseId,
        versionMajor: maxVersion.versionMajor + 1,
        versionMinor: 0,
        revisionType: "Major",
        revisionTriggers: ["ProgrammeCoordinator"],
        revisionReason: "Issue 211 historical drift regression",
        changeSummary: "Future approved version",
        reviewStatus: "Approved",
        approvedAt: new Date(),
        assessmentItems: {
          create: {
            id: futureAssessmentId,
            order: 0,
            name: "Future-version assessment",
            type: "Exam",
            status: "Active",
            weight: 100,
          },
        },
      },
    });

    const offering = await prisma.offering.create({
      data: {
        courseId: baseSpec.courseId,
        courseSpecId: baseSpec.id,
        lecturerId: actor.id,
        term: `issue211-${suffix}`,
        sectionCode: "A",
        status: "Completed",
      },
    });
    const sharedVersionSection = await prisma.offering.create({
      data: {
        courseId: baseSpec.courseId,
        courseSpecId: baseSpec.id,
        lecturerId: actor.id,
        term: `issue211-${suffix}`,
        sectionCode: "B",
        status: "Planned",
      },
    });
    expect(sharedVersionSection.courseSpecId).toBe(baseSpec.id);

    const studentUser = await prisma.user.create({
      data: { email: `issue211-user-${suffix}@dse.invalid`, name: "Issue 211 Student" },
    });
    const student = await prisma.student.create({
      data: {
        name: "Issue 211 Student",
        email: `issue211-profile-${suffix}@dse.invalid`,
        studentId: `I211-${suffix}`,
        status: "Active",
        userId: studentUser.id,
      },
    });
    const enrollment = await prisma.enrollment.create({
      data: { offeringId: offering.id, studentId: student.id },
    });
    await prisma.assessmentResult.create({
      data: {
        enrollmentId: enrollment.id,
        courseSpecId: baseSpec.id,
        assessmentItemId: baseAssessment.id,
        score: 8,
        maxScore: 10,
        feedback: "Historical v1 result",
        publishedAt: new Date(),
        publishedById: actor.id,
      },
    });

    const studentDetail = await studentPortalService.course(studentUser.id, offering.id);
    expect(studentDetail.assessments.some((item) => item.id === baseAssessment.id)).toBe(true);
    expect(studentDetail.assessments.some((item) => item.id === futureAssessmentId)).toBe(false);
    expect(studentDetail.assessments.find((item) => item.id === baseAssessment.id)?.result?.score).toBe(8);

    const delivery = await studentPortalService.deliveryOfferings(actor.id, true);
    const delivered = delivery.find((item) => item.offeringId === offering.id)!;
    expect(delivered.assessments.some((item) => item.id === baseAssessment.id)).toBe(true);
    expect(delivered.assessments.some((item) => item.id === futureAssessmentId)).toBe(false);

    const review = await resultsLifecycleService.review(actor.id, true, offering.id);
    expect(review.courseSpecId).toBe(baseSpec.id);

    // Historical binding cannot be moved to the newly-approved version.
    await rejected(() => prisma.offering.update({
      where: { id: offering.id },
      data: { courseSpecId: newerSpec.id },
    }));

    // Academic data cannot disagree with the Offering's bound version.
    await rejected(() => prisma.assessmentResult.create({
      data: {
        enrollmentId: enrollment.id,
        courseSpecId: newerSpec.id,
        assessmentItemId: futureAssessmentId,
        score: 9,
        maxScore: 10,
      },
    }));
    await rejected(() => prisma.offeringAssessmentDeadline.create({
      data: {
        offeringId: offering.id,
        courseSpecId: newerSpec.id,
        assessmentItemId: futureAssessmentId,
        dueAt: new Date(),
      },
    }));

    // Cross-course and non-approved bindings fail at the database boundary.
    const otherCourse = await prisma.course.create({
      data: {
        programmeId: baseSpec.course.programmeId,
        code: `I211-${suffix.slice(0, 8)}`,
        title: "Issue 211 Other Course",
      },
    });
    const draftSpec = await prisma.courseSpec.create({
      data: { courseId: otherCourse.id, revisionTriggers: [], reviewStatus: "Draft" },
    });
    await rejected(() => prisma.offering.create({
      data: {
        courseId: otherCourse.id,
        courseSpecId: draftSpec.id,
        term: `issue211-draft-${suffix}`,
        sectionCode: "A",
      },
    }));
    await rejected(() => prisma.offering.create({
      data: {
        courseId: otherCourse.id,
        courseSpecId: baseSpec.id,
        term: `issue211-cross-${suffix}`,
        sectionCode: "A",
      },
    }));
  });
});
