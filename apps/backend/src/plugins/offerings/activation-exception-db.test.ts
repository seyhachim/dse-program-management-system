import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { CourseType, Semester } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { coursesPlugin } from "../courses/index.ts";
import { lecturersPlugin } from "../lecturers/index.ts";
import { programmePlugin } from "../programme/index.ts";
import { academicCalendarService } from "../programme/academic-calendar-service.ts";
import { curriculumWorkflowService } from "../programme/curriculum-workflow-service.ts";
import { gradingScaleService } from "../programme/grading-scale-service.ts";
import { studentsPlugin } from "../students/index.ts";
import { studentPortalService } from "../student-portal/service.ts";
import { offeringActivationExceptionService } from "./activation-exception-service.ts";
import { offeringService } from "./service.ts";

process.env.JWT_SECRET ??= "issue-963-activation-exception-db-test-secret-at-least-32-characters";

const runDbTests = process.env.OFFERING_ACTIVATION_EXCEPTION_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

function ensureDependencies() {
  if (!registry.has("students")) registry.register(studentsPlugin);
  if (!registry.has("lecturers")) registry.register(lecturersPlugin);
  if (!registry.has("courses")) registry.register(coursesPlugin);
  if (!registry.has("programme")) registry.register(programmePlugin);
}

async function expectRejected(operation: () => Promise<unknown>) {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}

async function approveTestGradingScale(programmeId: string, actorId: string) {
  const draft = await gradingScaleService.create(actorId, {
    programmeId,
    code: "standard",
    name: "Standard Grading Scale",
    description: "Issue 963 fixture grading policy",
    effectiveFrom: "2197-01-01",
    changeSummary: "Initial issue 963 test grading policy",
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
  await gradingScaleService.approve(draft.id, actorId, {
    note: "Approve issue 963 fixture grading policy",
  });
}

dbDescribe("Offering activation exception integrity", () => {
  test("authorizes operational teaching without fabricating academic readiness and preserves audit history", async () => {
    ensureDependencies();
    const suffix = randomUUID();
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const lecturer = await prisma.user.findFirstOrThrow({
      where: { roleAssignments: { some: { role: { slug: "lecturer" } } } },
      select: { id: true },
    });
    const programmeId = `issue963-${suffix}`;
    await prisma.programme.create({
      data: {
        id: programmeId,
        code: `I963-${suffix.slice(0, 8)}`,
        name: "Issue 963 activation exception programme",
      },
    });
    await approveTestGradingScale(programmeId, actor.id);

    const course = await prisma.course.create({
      data: {
        programmeId,
        code: `AE-${suffix.slice(0, 8)}`,
        title: "Activation Exception Test Course",
        credits: 3,
        courseType: CourseType.Core,
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
      label: `2197-2198-${suffix.slice(0, 8)}`,
      startYear: 2197,
      endYear: 2198,
      isCurrent: false,
    });
    const draftCalendar = await academicCalendarService.createCalendar(programmeId, actor.id, {
      academicYearId: academicYear.id,
      revisionReason: "Issue 963 exception fixture",
      studyYears: [3],
      periods: [
        {
          semester: "First",
          teachingStart: "2197-09-01",
          teachingEnd: "2198-01-15",
        },
      ],
      events: [],
      sourceTitle: "Official issue 963 test calendar",
      sourcePublishedAt: "2197-08-01",
      sourceUrl: null,
      sourceFileRef: null,
      sourceNote: "Issue 963 regression fixture",
    });
    const published = await academicCalendarService.publishCalendar(
      programmeId,
      draftCalendar.id,
      actor.id,
    );

    const planned = await offeringService.create({
      courseId: course.id,
      courseSpecId: null,
      term: "ignored-client-term",
      sectionCode: "A",
      lecturerId: lecturer.id,
      coLecturerIds: [],
      capacity: 30,
      status: "Planned",
      meetings: [
        {
          dayOfWeek: "Monday",
          startTime: "08:00",
          endTime: "10:00",
          building: "STEM Building",
          room: "301",
          activityType: "Lecture",
        },
      ],
      semester: "First",
      programmeYear: 3,
      academicCalendarPeriodId: published.periods[0]!.id,
    });

    const requested = await offeringActivationExceptionService.request(
      planned.id,
      {
        reason: "Teaching must start while curriculum confirmation and CourseSpec approval are being completed.",
        documentationDueDate: "2197-10-01",
      },
      actor.id,
    );
    expect(requested.current?.status).toBe("PENDING");
    expect(requested.current?.missingItems).toEqual(["CURRICULUM", "COURSE_SPEC"]);

    await expectRejected(() =>
      offeringActivationExceptionService.request(
        planned.id,
        {
          reason: "A duplicate open exception must not be accepted by the governance workflow.",
          documentationDueDate: "2197-10-05",
        },
        actor.id,
      ),
    );

    const approved = await offeringActivationExceptionService.review(
      planned.id,
      requested.current!.id,
      { decision: "Approve", note: "Approved only for operational teaching continuity." },
      actor.id,
    );
    expect(approved.offeringStatus).toBe("Active");
    expect(approved.current?.status).toBe("APPROVED");

    const canonicalAfterApproval = await prisma.offering.findUniqueOrThrow({
      where: { id: planned.id },
      select: { status: true, courseSpecId: true },
    });
    expect(canonicalAfterApproval.status).toBe("Active");
    expect(canonicalAfterApproval.courseSpecId).toBeNull();
    const bindingCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM offering_governance."OfferingCurriculumBinding"
      WHERE "offeringId" = ${planned.id}
    `;
    expect(Number(bindingCount[0]?.count ?? 0n)).toBe(0);

    // Operational announcement/delivery paths may continue, but academic outputs
    // that require the exact Approved CourseSpec remain fail-closed.
    await studentPortalService.publishAnnouncement(lecturer.id, true, {
      offeringId: planned.id,
      title: "Class starts as scheduled",
      body: "Documentation is still pending; teaching operations continue.",
      pinned: false,
    });
    await expectRejected(() =>
      studentPortalService.setDeadline(lecturer.id, true, {
        offeringId: planned.id,
        assessmentItemId: randomUUID(),
        dueAt: "2197-10-10T00:00:00.000Z",
      }),
    );

    // The DB trigger protects both Offering service paths from completion while
    // the academic exception remains unresolved.
    await expectRejected(() =>
      prisma.offering.update({
        where: { id: planned.id },
        data: { status: "Completed" },
      }),
    );

    const curriculum = await prisma.programmeCurriculum.create({
      data: {
        programmeId,
        code: `CUR-${suffix.slice(0, 8)}`,
        name: "Issue 963 confirmed curriculum",
      },
    });
    const curriculumVersion = await prisma.programmeCurriculumVersion.create({
      data: {
        curriculumId: curriculum.id,
        cohortLabel: "Issue 963 fixture cohort",
        intakeYear: 2197,
        academicYear: academicYear.label,
        createdById: actor.id,
      },
    });
    await prisma.programmeCurriculumCourse.create({
      data: {
        curriculumVersionId: curriculumVersion.id,
        courseId: course.id,
        courseSpecVersionId: approvedSpec.id,
        yearLevel: 3,
        semester: Semester.First,
        creditsSnapshot: 3,
        courseTypeSnapshot: CourseType.Core,
        sortOrder: 0,
      },
    });
    await curriculumWorkflowService.submit(
      curriculumVersion.id,
      actor.id,
      "Submit issue 963 fixture curriculum",
    );
    await curriculumWorkflowService.approve(
      curriculumVersion.id,
      actor.id,
      "Approve issue 963 fixture curriculum",
    );

    await offeringService.update(planned.id, { courseSpecId: approvedSpec.id });
    const ready = await offeringActivationExceptionService.snapshot(planned.id);
    expect(ready.readiness.normalReady).toBe(true);
    expect(ready.current?.status).toBe("APPROVED");

    await expectRejected(() =>
      offeringService.update(planned.id, { status: "Completed" }),
    );

    const resolved = await offeringActivationExceptionService.resolve(
      planned.id,
      requested.current!.id,
      "Canonical curriculum and Approved CourseSpec are now complete.",
      actor.id,
    );
    expect(resolved.current).toBeNull();
    expect(resolved.latest?.status).toBe("RESOLVED");
    expect(resolved.offeringStatus).toBe("Active");
    expect(resolved.history.map((event) => event.action)).toEqual([
      "Requested",
      "Approved",
      "Resolved",
    ]);

    const completed = await offeringService.update(planned.id, { status: "Completed" });
    expect(completed.status).toBe("Completed");
  });

  test("expires an approved exception, demotes operational status, and keeps governance tables outside Data API access", async () => {
    ensureDependencies();
    const base = await prisma.offering.findFirstOrThrow({
      where: {
        status: "Completed",
        term: { contains: "2197-2198" },
      },
      select: {
        courseId: true,
        lecturerId: true,
        academicCalendarPeriodId: true,
        programmeYear: true,
        semester: true,
      },
    });
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const planned = await offeringService.create({
      courseId: base.courseId,
      courseSpecId: null,
      term: "ignored-client-term",
      sectionCode: "B",
      lecturerId: base.lecturerId,
      coLecturerIds: [],
      capacity: 30,
      status: "Planned",
      meetings: [
        {
          dayOfWeek: "Tuesday",
          startTime: "08:00",
          endTime: "10:00",
          building: "STEM Building",
          room: "302",
          activityType: "Lecture",
        },
      ],
      semester: base.semester,
      programmeYear: base.programmeYear,
      academicCalendarPeriodId: base.academicCalendarPeriodId,
    });
    const requested = await offeringActivationExceptionService.request(
      planned.id,
      {
        reason: "CourseSpec documentation is still pending at the beginning of teaching delivery.",
        documentationDueDate: "2197-10-01",
      },
      actor.id,
    );
    await offeringActivationExceptionService.review(
      planned.id,
      requested.current!.id,
      { decision: "Approve", note: "Time-bounded operational exception." },
      actor.id,
    );

    expect(
      await offeringActivationExceptionService.expireOverdue(planned.id, "2197-10-02"),
    ).toBe(true);
    const expired = await offeringActivationExceptionService.snapshot(planned.id);
    expect(expired.current).toBeNull();
    expect(expired.latest?.status).toBe("EXPIRED");
    expect(expired.offeringStatus).toBe("Planned");
    expect(expired.history.at(-1)?.action).toBe("Expired");

    const securityRows = await prisma.$queryRaw<
      Array<{ table_name: string; rls_enabled: boolean }>
    >`
      SELECT c.relname::text AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'offering_governance'
        AND c.relname IN ('OfferingActivationException', 'OfferingActivationExceptionAuditEvent')
      ORDER BY c.relname
    `;
    expect(securityRows).toHaveLength(2);
    expect(securityRows.every((row) => row.rls_enabled)).toBe(true);

    const forbiddenGrants = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.role_table_grants
      WHERE table_schema = 'offering_governance'
        AND table_name IN ('OfferingActivationException', 'OfferingActivationExceptionAuditEvent')
        AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
    `;
    expect(Number(forbiddenGrants[0]?.count ?? 0n)).toBe(0);
  });
});
