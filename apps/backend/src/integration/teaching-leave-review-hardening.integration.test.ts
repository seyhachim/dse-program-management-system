import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { AuthUser, Role } from "../core/auth/token.ts";
import { prisma } from "../core/db/prisma.ts";
import {
  TeachingLeaveConflictError,
  TeachingLeaveNotFoundError,
  teachingLeaveService,
} from "../plugins/offerings/teaching-leave-service.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;
const CO_LECTURER_DATE = "2099-02-02";
const REVISION_DATE = "2099-02-09";
const STUDENT_IMPACT_DATE = "2099-02-16";
const IDEMPOTENT_EXPIRY_DATE = "2099-02-23";

type SubmissionSnapshot = {
  confidentialReason?: string;
  attachmentRef?: string | null;
  proposedHandling?: string;
};
type ResubmissionAuditDetails = {
  previousSubmission?: SubmissionSnapshot;
  newSubmission?: SubmissionSnapshot;
};

integrationDescribe("Teaching leave review hardening", () => {
  let lecturer: AuthUser;
  let coLecturer: AuthUser;
  let coordinator: AuthUser;
  let offeringId = "";
  let meetingId = "";
  let enrolledStudent: AuthUser;
  let unrelatedStudent: AuthUser;
  const originalEnv = {
    TELEGRAM_PMS_ENABLED: process.env.TELEGRAM_PMS_ENABLED,
    TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED,
    JWT_SECRET: process.env.JWT_SECRET,
    TELEGRAM_MINI_APP_URL: process.env.TELEGRAM_MINI_APP_URL,
  };

  beforeAll(async () => {
    process.env.TELEGRAM_PMS_ENABLED = "false";
    process.env.TELEGRAM_ENABLED = "false";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "teaching-leave-hardening-secret";
    process.env.TELEGRAM_MINI_APP_URL = "https://example.com/telegram";

    lecturer = await loadAuthUser("lecturer@dse.dev");
    coLecturer = await loadAuthUser("hopper.lecturer@dse.dev");
    coordinator = await loadAuthUser("coordinator@dse.dev");

    const course = await prisma.course.create({
      data: {
        code: `LEAVE-H-${randomUUID().slice(0, 8)}`,
        title: "Teaching Leave Hardening Fixture",
        programmeId: "dse",
      },
    });
    const offering = await prisma.offering.create({
      data: {
        courseId: course.id,
        lecturerId: lecturer.id,
        term: `2099-H-${randomUUID().slice(0, 6)}`,
        sectionCode: "A",
        status: "Active",
        startDate: new Date("2099-02-01T00:00:00.000Z"),
        endDate: new Date("2099-03-31T00:00:00.000Z"),
        coLecturers: { create: { lecturerId: coLecturer.id } },
        meetings: {
          create: {
            dayOfWeek: "Monday",
            startTime: "08:00",
            endTime: "10:00",
            room: "R932-H",
            activityType: "Lecture",
          },
        },
      },
      include: { meetings: true },
    });
    offeringId = offering.id;
    meetingId = offering.meetings[0]!.id;

    enrolledStudent = await createStudentAuth("enrolled");
    unrelatedStudent = await createStudentAuth("unrelated");
    const enrolledRecord = await prisma.student.findUniqueOrThrow({ where: { userId: enrolledStudent.id } });
    await prisma.enrollment.create({ data: { offeringId, studentId: enrolledRecord.id } });
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("one active occurrence leave prevents a co-lecturer request from becoming unapprovable", async () => {
    const first = await teachingLeaveService.submit(lecturer, leaveInput(CO_LECTURER_DATE));
    await expect(teachingLeaveService.submit(coLecturer, leaveInput(CO_LECTURER_DATE)))
      .rejects.toBeInstanceOf(TeachingLeaveConflictError);

    const active = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."TeachingLeaveRequestOccurrence" link
      JOIN "pms_attendance"."TeachingLeaveRequest" leave ON leave."id"=link."requestId"
      WHERE link."occurrenceId"=${first.occurrences[0]!.occurrenceId}
        AND leave."status" IN ('PENDING','CHANGES_REQUESTED','APPROVED')
    `;
    expect(Number(active[0]?.count ?? 0n)).toBe(1);
    await teachingLeaveService.review(coordinator, first.id, { decision: "REJECT", comment: "Fixture cleanup" });
  });

  test("resubmission preserves the prior confidential submission in protected audit history", async () => {
    const request = await teachingLeaveService.submit(lecturer, leaveInput(REVISION_DATE));
    await teachingLeaveService.review(coordinator, request.id, {
      decision: "REQUEST_CHANGES",
      comment: "Clarify the recovery plan",
    });
    await teachingLeaveService.revise(lecturer, request.id, {
      leaveType: "OFFICIAL_DUTY",
      confidentialReason: "Updated confidential reason",
      attachmentRef: "private://updated-reference",
      proposedHandling: "MAKE_UP",
      proposedNote: "Updated recovery plan",
    });

    const rows = await prisma.$queryRaw<Array<{ details: ResubmissionAuditDetails }>>`
      SELECT "details"
      FROM "pms_attendance"."TeachingLeaveAuditEvent"
      WHERE "requestId"=${request.id} AND "action"='SUBMITTED'
      ORDER BY "createdAt","id"
    `;
    const resubmission = rows.at(-1)?.details;
    expect(resubmission?.previousSubmission).toMatchObject({
      confidentialReason: "Original confidential reason",
      attachmentRef: "private://original-reference",
      proposedHandling: "OPEN_SLOT",
    });
    expect(resubmission?.newSubmission).toMatchObject({
      confidentialReason: "Updated confidential reason",
      attachmentRef: "private://updated-reference",
      proposedHandling: "MAKE_UP",
    });

    await teachingLeaveService.review(coordinator, request.id, { decision: "REJECT", comment: "Fixture cleanup" });
  });

  test("enrolled students can read only the approved occurrence impact", async () => {
    const request = await teachingLeaveService.submit(lecturer, leaveInput(STUDENT_IMPACT_DATE));
    const approval = await teachingLeaveService.review(coordinator, request.id, {
      decision: "APPROVE",
      comment: "Approved fixture",
    });
    expect(approval.notifications.students.missing).toBeGreaterThanOrEqual(1);

    const occurrenceId = request.occurrences[0]!.occurrenceId;
    const impact = await teachingLeaveService.studentImpact(enrolledStudent, occurrenceId);
    expect(impact).toMatchObject({
      requestId: request.id,
      occurrenceId,
      offeringId,
      sessionDate: STUDENT_IMPACT_DATE,
      proposedHandling: "OPEN_SLOT",
    });
    expect((impact as Record<string, unknown>).confidentialReason).toBeUndefined();
    expect((impact as Record<string, unknown>).reviewComment).toBeUndefined();
    expect((impact as Record<string, unknown>).requester).toBeUndefined();

    await expect(teachingLeaveService.studentImpact(unrelatedStudent, occurrenceId))
      .rejects.toBeInstanceOf(TeachingLeaveNotFoundError);
  });

  test("idempotent approval after session expiry does not resend stale student or open-slot notices", async () => {
    const request = await teachingLeaveService.submit(lecturer, leaveInput(IDEMPOTENT_EXPIRY_DATE));
    const first = await teachingLeaveService.review(coordinator, request.id, {
      decision: "APPROVE",
      comment: "Approved before class",
    });
    expect(first.changed).toBe(true);

    const occurrenceId = request.occurrences[0]!.occurrenceId;
    await prisma.$executeRaw`
      UPDATE "pms_attendance"."TeachingSessionOccurrence"
      SET "sessionDate"='2000-01-03'::date,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${occurrenceId}
    `;

    const repeated = await teachingLeaveService.review(coordinator, request.id, {
      decision: "APPROVE",
      comment: "Idempotent retry after expiry",
    });
    expect(repeated.changed).toBe(false);
    expect(repeated.notifications.students).toEqual({ sent: 0, failed: 0, duplicate: 0, missing: 0 });
    expect(repeated.notifications.lecturerGroup).toEqual([]);
  });

  function leaveInput(date: string) {
    return {
      occurrences: [{ offeringId, offeringMeetingId: meetingId, date, releaseForReuse: true }],
      leaveType: "OFFICIAL_DUTY" as const,
      confidentialReason: "Original confidential reason",
      attachmentRef: "private://original-reference",
      proposedHandling: "OPEN_SLOT" as const,
      proposedNote: "Recover the original course separately",
    };
  }
});

async function loadAuthUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roleAssignments: { include: { role: true } } },
  });
  return {
    id: user.id,
    email: user.email,
    roles: user.roleAssignments.map((assignment) => assignment.role.slug as Role),
    programmeRoles: user.roleAssignments.map((assignment) => ({
      role: assignment.role.slug as Role,
      programmeId: assignment.programmeId,
    })),
  };
}

async function createStudentAuth(label: string): Promise<AuthUser> {
  const user = await prisma.user.create({
    data: { email: `leave-${label}-${randomUUID()}@example.test`, name: `Leave ${label} student` },
  });
  await prisma.student.create({
    data: { name: `Leave ${label} student`, studentId: `LH-${randomUUID()}`, userId: user.id },
  });
  return { id: user.id, email: user.email, roles: ["student"], programmeRoles: [] };
}
