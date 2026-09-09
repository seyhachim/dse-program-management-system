import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { coursesPlugin } from "../courses/index.ts";
import { lecturersPlugin } from "../lecturers/index.ts";
import { programmePlugin } from "../programme/index.ts";
import { academicCalendarService } from "../programme/academic-calendar-service.ts";
import { gradingScaleService } from "../programme/grading-scale-service.ts";
import { studentsPlugin } from "../students/index.ts";
import { studentPortalService } from "../student-portal/service.ts";
import { resultsLifecycleService } from "../student-portal/results-lifecycle.ts";
import { offeringService } from "./service.ts";

process.env.JWT_SECRET ??= "issue-211-course-spec-binding-test-secret-at-least-32-characters";

const runDbTests = process.env.OFFERING_COURSE_SPEC_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

async function rejected(operation: () => Promise<unknown>) {
  let didReject = false;
  try { await operation(); } catch { didReject = true; }
  expect(didReject).toBe(true);
}

function ensureOfferingDependencies() {
  if (!registry.has("students")) registry.register(studentsPlugin);
  if (!registry.has("lecturers")) registry.register(lecturersPlugin);
  if (!registry.has("courses")) registry.register(coursesPlugin);
  if (!registry.has("programme")) registry.register(programmePlugin);
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

  test("allows Planned setup while academic documents are pending but gates activation", async () => {
    ensureOfferingDependencies();
    const suffix = randomUUID();
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const lecturer = await prisma.user.findFirstOrThrow({
      where: { roleAssignments: { some: { role: { slug: "lecturer" } } } },
      select: { id: true },
    });
    const programmeId = `offering-pending-${suffix}`;
    await prisma.programme.create({
      data: {
        id: programmeId,
        code: `OP-${suffix.slice(0, 8)}`,
        name: "Provisional Offering Programme",
        status: "active",
      },
    });
    const gradingDraft = await gradingScaleService.create(actor.id, {
      programmeId,
      code: "standard",
      name: "Standard Grading Scale",
      description: "Provisional Offering test grading policy",
      effectiveFrom: "2020-01-01",
      changeSummary: "Initial test grading policy",
      grades: [
        {
          sortOrder: 1,
          letterGrade: "P",
          gradePoint: 1,
          minScore: 50,
          maxScore: 100,
          minInclusive: true,
          maxInclusive: true,
          explanation: "Pass",
          isPassing: true,
        },
        {
          sortOrder: 2,
          letterGrade: "F",
          gradePoint: 0,
          minScore: 0,
          maxScore: 50,
          minInclusive: true,
          maxInclusive: false,
          explanation: "Fail",
          isPassing: false,
        },
      ],
    });
    await gradingScaleService.approve(gradingDraft.id, actor.id, {
      note: "Approve provisional Offering test grading policy",
    });
    const course = await prisma.course.create({
      data: {
        programmeId,
        code: `PO-${suffix.slice(0, 8)}`,
        title: "Provisional Offering Course",
        credits: 3,
        courseType: "Core",
      },
    });
    const approvedSpec = await prisma.courseSpec.create({
      data: {
        courseId: course.id,
        revisionTriggers: [],
        reviewStatus: "Approved",
        approvedAt: new Date(),
      },
    });
    const academicYear = await academicCalendarService.createAcademicYear(programmeId, {
      label: `2196-2197-${suffix.slice(0, 8)}`,
      startYear: 2196,
      endYear: 2197,
      isCurrent: false,
    });
    const draft = await academicCalendarService.createCalendar(programmeId, actor.id, {
      academicYearId: academicYear.id,
      revisionReason: "Published before curriculum confirmation",
      studyYears: [3],
      periods: [{ semester: "First", teachingStart: "2196-09-01", teachingEnd: "2197-01-15" }],
      events: [],
      sourceTitle: "Official provisional-offering calendar",
      sourcePublishedAt: "2196-08-01",
      sourceUrl: null,
      sourceFileRef: null,
      sourceNote: "Official test source",
    });
    const published = await academicCalendarService.publishCalendar(programmeId, draft.id, actor.id);

    const planned = await offeringService.create({
      courseId: course.id,
      courseSpecId: null,
      term: "ignored-client-term",
      sectionCode: "A",
      lecturerId: lecturer.id,
      coLecturerIds: [],
      capacity: 30,
      status: "Planned",
      meetings: [{ dayOfWeek: "Monday", startTime: "08:00", endTime: "10:00", room: "A101", activityType: "Lecture" }],
      semester: "First",
      programmeYear: 3,
      academicCalendarPeriodId: published.periods[0]!.id,
    });
    expect(planned.status).toBe("Planned");
    expect(planned.courseSpec).toBeNull();
    expect(planned.term).toBe(`${academicYear.label}-S1`);

    await rejected(() => offeringService.update(planned.id, { status: "Active" }));
    await rejected(() => offeringService.update(planned.id, {
      courseSpecId: approvedSpec.id,
      status: "Active",
    }));

    const curriculum = await prisma.programmeCurriculum.create({
      data: {
        programmeId,
        code: `CUR-${suffix.slice(0, 8)}`,
        name: "Confirmed curriculum",
      },
    });
    const curriculumVersion = await prisma.programmeCurriculumVersion.create({
      data: {
        curriculumId: curriculum.id,
        status: "Approved",
        revisionTriggers: [],
        academicYear: academicYear.label,
        approvedAt: new Date(),
        createdById: actor.id,
      },
    });
    await prisma.programmeCurriculumCourse.create({
      data: {
        curriculumVersionId: curriculumVersion.id,
        courseId: course.id,
        courseSpecVersionId: approvedSpec.id,
        yearLevel: 3,
        semester: "First",
        creditsSnapshot: 3,
        courseTypeSnapshot: "Core",
        sortOrder: 0,
      },
    });

    const active = await offeringService.update(planned.id, {
      courseSpecId: approvedSpec.id,
      status: "Active",
    });
    expect(active.status).toBe("Active");
    expect(active.courseSpec?.id).toBe(approvedSpec.id);
  });
});
