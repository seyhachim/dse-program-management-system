import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../core/auth/token.ts";
import {
  OpenTeachingSlotAuthorizationError,
  OpenTeachingSlotConflictError,
  OpenTeachingSlotValidationError,
} from "./open-teaching-slot-service.ts";
import { openTeachingSlotWorkflowService } from "./open-teaching-slot-workflow-service.ts";

const dbTestsEnabled = process.env.OPEN_TEACHING_SLOT_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();

function authUser(
  user: { id: string; email: string },
  role: "lecturer" | "program_coordinator" | "admin" = "lecturer",
  programmeId: string | null = "dse",
): AuthUser {
  return {
    id: user.id,
    email: user.email,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

async function createUser(label: string) {
  return prisma.user.create({
    data: {
      email: `open-slot-${label}-${crypto.randomUUID()}@example.test`,
      name: `Open Slot ${label}`,
    },
  });
}

async function createCourse(programmeId: string, label: string) {
  return prisma.course.create({
    data: {
      code: `OS-${label}-${crypto.randomUUID().slice(0, 8)}`,
      title: `Open Slot ${label}`,
      programmeId,
    },
  });
}

async function createStudent(label: string, withUser = false) {
  const user = withUser ? await createUser(`student-${label}`) : null;
  const student = await prisma.student.create({
    data: {
      name: `Open Slot Student ${label}`,
      email: `open-slot-student-${label}-${crypto.randomUUID()}@example.test`,
      studentId: `OS-${label}-${crypto.randomUUID().slice(0, 8)}`,
      status: "Active",
      userId: user?.id,
    },
  });
  return { student, user };
}

type FixtureOptions = {
  date?: string;
  room?: string | null;
  sectionCode?: string;
  term?: string;
  studentWithUser?: boolean;
};

async function createFixture(label: string, options: FixtureOptions = {}) {
  const date = options.date ?? "2099-09-14";
  const room = options.room === undefined ? "306" : options.room;
  const sectionCode = options.sectionCode ?? "M1";
  const term = options.term ?? `2099-${label}`;

  const requester = await createUser(`${label}-requester`);
  const claimant = await createUser(`${label}-claimant`);
  const manager = await createUser(`${label}-manager`);
  const { student, user: studentUser } = await createStudent(label, options.studentWithUser);
  const sourceCourse = await createCourse("dse", `${label}-source`);
  const targetCourse = await createCourse("dse", `${label}-target`);

  const sourceOffering = await prisma.offering.create({
    data: {
      courseId: sourceCourse.id,
      term,
      sectionCode,
      status: "Active",
      lecturerId: requester.id,
      meetings: {
        create: {
          dayOfWeek: "Monday",
          startTime: "08:00",
          endTime: "12:00",
          room,
          activityType: "Lecture",
        },
      },
      enrollments: { create: { studentId: student.id } },
    },
    include: { meetings: true },
  });

  const targetOffering = await prisma.offering.create({
    data: {
      courseId: targetCourse.id,
      term,
      sectionCode,
      status: "Active",
      lecturerId: claimant.id,
      enrollments: { create: { studentId: student.id } },
    },
  });

  const occurrenceId = crypto.randomUUID();
  const leaveId = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "pms_attendance"."TeachingSessionOccurrence"
      ("id","offeringId","offeringMeetingId","sessionDate","scheduledDayOfWeek",
       "scheduledStartTime","scheduledEndTime","scheduledRoom","scheduledActivityType")
    VALUES (
      ${occurrenceId},${sourceOffering.id},${sourceOffering.meetings[0]!.id},${date}::date,'Monday',
      '08:00','12:00',${room},'Lecture'
    )
  `;
  await prisma.$executeRaw`
    INSERT INTO "pms_attendance"."TeachingLeaveRequest"
      ("id","programmeId","requesterId","leaveType","confidentialReason","attachmentRef",
       "proposedHandling","proposedNote","noticeHours","submittedLate","status","reviewedById","reviewedAt")
    VALUES (
      ${leaveId},'dse',${requester.id},'PERSONAL','private fixture reason',NULL,
      'OPEN_SLOT','fixture',24,FALSE,'PENDING',${manager.id},CURRENT_TIMESTAMP
    )
  `;
  await prisma.$executeRaw`
    INSERT INTO "pms_attendance"."TeachingLeaveRequestOccurrence"
      ("requestId","occurrenceId","releaseForReuse")
    VALUES (${leaveId},${occurrenceId},TRUE)
  `;
  await prisma.$executeRaw`
    UPDATE "pms_attendance"."TeachingSessionOccurrence"
    SET "approvedLeaveRequestId"=${leaveId}
    WHERE "id"=${occurrenceId}
  `;
  await prisma.$executeRaw`
    UPDATE "pms_attendance"."TeachingLeaveRequest"
    SET "status"='APPROVED', "updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${leaveId}
  `;

  return {
    requester,
    claimant,
    manager,
    student,
    studentUser,
    sourceCourse,
    targetCourse,
    sourceOffering,
    targetOffering,
    sourceOccurrenceId: occurrenceId,
    leaveId,
    slotId: occurrenceId,
    date,
    room,
    sectionCode,
    term,
  };
}

async function createTargetOffering(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  input: {
    label: string;
    lecturerId: string;
    courseProgrammeId?: string;
    sectionCode?: string;
    term?: string;
    studentIds?: string[];
    meeting?: { dayOfWeek: string; startTime: string; endTime: string; room: string | null };
  },
) {
  const programmeId = input.courseProgrammeId ?? "dse";
  const course = await createCourse(programmeId, input.label);
  return prisma.offering.create({
    data: {
      courseId: course.id,
      term: input.term ?? fixture.term,
      sectionCode: input.sectionCode ?? fixture.sectionCode,
      status: "Active",
      lecturerId: input.lecturerId,
      enrollments: {
        create: (input.studentIds ?? [fixture.student.id]).map((studentId) => ({ studentId })),
      },
      meetings: input.meeting
        ? {
            create: {
              ...input.meeting,
              activityType: "Lecture",
            },
          }
        : undefined,
    },
  });
}

async function claimForFixture(fixture: Awaited<ReturnType<typeof createFixture>>) {
  return openTeachingSlotWorkflowService.claim(
    authUser(fixture.claimant),
    fixture.slotId,
    { targetOfferingId: fixture.targetOffering.id },
  );
}

afterAll(async () => {
  await prisma.$disconnect();
});

describeDb("open teaching slot integrity", () => {
  test("approved reusable leave materializes exactly one slot and repeated approval is idempotent", async () => {
    const fixture = await createFixture("materialize");
    await prisma.$executeRaw`
      UPDATE "pms_attendance"."TeachingLeaveRequest"
      SET "status"='APPROVED', "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${fixture.leaveId}
    `;

    const slots = await prisma.$queryRaw<Array<{ id: string; sourceOccurrenceId: string; status: string }>>`
      SELECT "id","sourceOccurrenceId","status"
      FROM "pms_attendance"."OpenTeachingSlot"
      WHERE "sourceOccurrenceId"=${fixture.sourceOccurrenceId}
    `;
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      id: fixture.slotId,
      sourceOccurrenceId: fixture.sourceOccurrenceId,
      status: "OPEN",
    });

    const audits = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."OpenTeachingSlotAuditEvent"
      WHERE "slotId"=${fixture.slotId} AND "action"='OPENED'
    `;
    expect(Number(audits[0]?.count ?? 0n)).toBe(1);
  });

  test("concurrent claim attempts serialize so only one lecturer reserves a slot", async () => {
    const fixture = await createFixture("claim-race");
    const secondClaimant = await createUser("claim-race-second");
    const secondTarget = await createTargetOffering(fixture, {
      label: "claim-race-second-target",
      lecturerId: secondClaimant.id,
    });

    const results = await Promise.allSettled([
      openTeachingSlotWorkflowService.claim(
        authUser(fixture.claimant),
        fixture.slotId,
        { targetOfferingId: fixture.targetOffering.id },
      ),
      openTeachingSlotWorkflowService.claim(
        authUser(secondClaimant),
        fixture.slotId,
        { targetOfferingId: secondTarget.id },
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."OpenTeachingSlotClaim"
      WHERE "slotId"=${fixture.slotId} AND "status"='REQUESTED'
    `;
    expect(Number(rows[0]?.count ?? 0n)).toBe(1);
  });

  test("approval creates one separate canonical occurrence and never rewrites the original missed course", async () => {
    const fixture = await createFixture("approve");
    const claim = await claimForFixture(fixture);
    const result = await openTeachingSlotWorkflowService.review(
      authUser(fixture.manager, "program_coordinator"),
      claim.id,
      { decision: "APPROVE" },
    );

    expect(result.changed).toBe(true);
    expect(result.claim.status).toBe("APPROVED");
    expect(result.claim.confirmedOccurrenceId).toBeTruthy();

    const sourceRows = await prisma.$queryRaw<Array<{
      offeringId: string;
      approvedLeaveRequestId: string | null;
      sourceOpenTeachingSlotId: string | null;
    }>>`
      SELECT "offeringId","approvedLeaveRequestId","sourceOpenTeachingSlotId"
      FROM "pms_attendance"."TeachingSessionOccurrence"
      WHERE "id"=${fixture.sourceOccurrenceId}
    `;
    expect(sourceRows[0]).toEqual({
      offeringId: fixture.sourceOffering.id,
      approvedLeaveRequestId: fixture.leaveId,
      sourceOpenTeachingSlotId: null,
    });

    const assignedRows = await prisma.$queryRaw<Array<{
      id: string;
      offeringId: string;
      approvedLeaveRequestId: string | null;
      sourceOpenTeachingSlotId: string | null;
    }>>`
      SELECT "id","offeringId","approvedLeaveRequestId","sourceOpenTeachingSlotId"
      FROM "pms_attendance"."TeachingSessionOccurrence"
      WHERE "id"=${result.claim.confirmedOccurrenceId!}
    `;
    expect(assignedRows[0]).toMatchObject({
      offeringId: fixture.targetOffering.id,
      approvedLeaveRequestId: null,
      sourceOpenTeachingSlotId: fixture.slotId,
    });
  });

  test("concurrent approval retries cannot create two assigned occurrences", async () => {
    const fixture = await createFixture("review-race");
    const secondManager = await createUser("review-race-manager-two");
    const claim = await claimForFixture(fixture);

    const results = await Promise.allSettled([
      openTeachingSlotWorkflowService.review(
        authUser(fixture.manager, "program_coordinator"),
        claim.id,
        { decision: "APPROVE" },
      ),
      openTeachingSlotWorkflowService.review(
        authUser(secondManager, "program_coordinator"),
        claim.id,
        { decision: "APPROVE" },
      ),
    ]);
    expect(results.filter((result) => result.status === "fulfilled").length).toBeGreaterThanOrEqual(1);

    const assigned = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."TeachingSessionOccurrence"
      WHERE "sourceOpenTeachingSlotId"=${fixture.slotId}
    `;
    expect(Number(assigned[0]?.count ?? 0n)).toBe(1);
  });

  test("claimant must teach the selected offering", async () => {
    const fixture = await createFixture("unauthorized-target");
    const otherLecturer = await createUser("unauthorized-target-owner");
    const target = await createTargetOffering(fixture, {
      label: "unauthorized-target-offering",
      lecturerId: otherLecturer.id,
    });

    await expect(
      openTeachingSlotWorkflowService.claim(
        authUser(fixture.claimant),
        fixture.slotId,
        { targetOfferingId: target.id },
      ),
    ).rejects.toBeInstanceOf(OpenTeachingSlotAuthorizationError);
  });

  test("cross-programme and wrong-section targets fail closed", async () => {
    const fixture = await createFixture("scope-denial");
    const otherProgrammeId = `other-${crypto.randomUUID().slice(0, 8)}`;
    await prisma.programme.create({
      data: { id: otherProgrammeId, code: otherProgrammeId.toUpperCase(), name: "Other Programme" },
    });
    const crossProgramme = await createTargetOffering(fixture, {
      label: "scope-other-programme",
      lecturerId: fixture.claimant.id,
      courseProgrammeId: otherProgrammeId,
    });
    await expect(
      openTeachingSlotWorkflowService.claim(
        authUser(fixture.claimant),
        fixture.slotId,
        { targetOfferingId: crossProgramme.id },
      ),
    ).rejects.toBeInstanceOf(OpenTeachingSlotAuthorizationError);

    const wrongSection = await createTargetOffering(fixture, {
      label: "scope-wrong-section",
      lecturerId: fixture.claimant.id,
      sectionCode: "M2",
    });
    await expect(
      openTeachingSlotWorkflowService.claim(
        authUser(fixture.claimant),
        fixture.slotId,
        { targetOfferingId: wrongSection.id },
      ),
    ).rejects.toBeInstanceOf(OpenTeachingSlotValidationError);
  });

  test("a mismatched enrolled class is rejected", async () => {
    const fixture = await createFixture("class-denial");
    const { student: otherStudent } = await createStudent("class-denial-other");
    const target = await createTargetOffering(fixture, {
      label: "class-denial-target",
      lecturerId: fixture.claimant.id,
      studentIds: [otherStudent.id],
    });

    await expect(
      openTeachingSlotWorkflowService.claim(
        authUser(fixture.claimant),
        fixture.slotId,
        { targetOfferingId: target.id },
      ),
    ).rejects.toBeInstanceOf(OpenTeachingSlotValidationError);
  });

  test("lecturer overlap is rejected server-side", async () => {
    const fixture = await createFixture("lecturer-conflict");
    await createTargetOffering(fixture, {
      label: "lecturer-conflict-existing",
      lecturerId: fixture.claimant.id,
      studentIds: [],
      meeting: { dayOfWeek: "Monday", startTime: "09:00", endTime: "10:00", room: null },
    });

    await expect(claimForFixture(fixture)).rejects.toBeInstanceOf(OpenTeachingSlotConflictError);
  });

  test("affected-student overlap is rejected server-side", async () => {
    const fixture = await createFixture("student-conflict");
    const otherLecturer = await createUser("student-conflict-other-lecturer");
    await createTargetOffering(fixture, {
      label: "student-conflict-existing",
      lecturerId: otherLecturer.id,
      meeting: { dayOfWeek: "Monday", startTime: "09:00", endTime: "10:00", room: null },
    });

    await expect(claimForFixture(fixture)).rejects.toBeInstanceOf(OpenTeachingSlotConflictError);
  });

  test("room overlap is rejected server-side", async () => {
    const fixture = await createFixture("room-conflict", { room: "306" });
    const otherLecturer = await createUser("room-conflict-other-lecturer");
    const { student: unrelatedStudent } = await createStudent("room-conflict-unrelated");
    await createTargetOffering(fixture, {
      label: "room-conflict-existing",
      lecturerId: otherLecturer.id,
      studentIds: [unrelatedStudent.id],
      meeting: { dayOfWeek: "Monday", startTime: "09:00", endTime: "10:00", room: "306" },
    });

    await expect(claimForFixture(fixture)).rejects.toBeInstanceOf(OpenTeachingSlotConflictError);
  });

  test("expired open slot is persisted as EXPIRED instead of rolling back on claim failure", async () => {
    const fixture = await createFixture("expired-claim", { date: "2020-01-06" });
    await expect(claimForFixture(fixture)).rejects.toBeInstanceOf(OpenTeachingSlotConflictError);

    const slots = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "pms_attendance"."OpenTeachingSlot" WHERE "id"=${fixture.slotId}
    `;
    expect(slots[0]?.status).toBe("EXPIRED");
  });

  test("withdrawal after a slot ends leaves it EXPIRED with history preserved", async () => {
    const fixture = await createFixture("expired-withdraw");
    const claim = await claimForFixture(fixture);
    await prisma.$executeRaw`
      UPDATE "pms_attendance"."TeachingSessionOccurrence"
      SET "sessionDate"='2020-01-06'::date
      WHERE "id"=${fixture.sourceOccurrenceId}
    `;

    const withdrawn = await openTeachingSlotWorkflowService.withdraw(authUser(fixture.claimant), claim.id);
    expect(withdrawn.status).toBe("WITHDRAWN");
    const slots = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "pms_attendance"."OpenTeachingSlot" WHERE "id"=${fixture.slotId}
    `;
    expect(slots[0]?.status).toBe("EXPIRED");
  });

  test("rejection after a slot ends closes the request without reopening stale availability", async () => {
    const fixture = await createFixture("expired-reject");
    const claim = await claimForFixture(fixture);
    await prisma.$executeRaw`
      UPDATE "pms_attendance"."TeachingSessionOccurrence"
      SET "sessionDate"='2020-01-06'::date
      WHERE "id"=${fixture.sourceOccurrenceId}
    `;

    const result = await openTeachingSlotWorkflowService.review(
      authUser(fixture.manager, "program_coordinator"),
      claim.id,
      { decision: "REJECT", comment: "Slot has ended" },
    );
    expect(result.claim.status).toBe("REJECTED");
    const slots = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "pms_attendance"."OpenTeachingSlot" WHERE "id"=${fixture.slotId}
    `;
    expect(slots[0]?.status).toBe("EXPIRED");
  });

  test("self-review is denied", async () => {
    const fixture = await createFixture("self-review");
    const claim = await claimForFixture(fixture);
    const claimantManager: AuthUser = {
      id: fixture.claimant.id,
      email: fixture.claimant.email,
      roles: ["lecturer", "program_coordinator"],
      programmeRoles: [
        { role: "lecturer", programmeId: "dse" },
        { role: "program_coordinator", programmeId: "dse" },
      ],
    };
    await expect(
      openTeachingSlotWorkflowService.review(claimantManager, claim.id, { decision: "APPROVE" }),
    ).rejects.toBeInstanceOf(OpenTeachingSlotAuthorizationError);
  });

  test("student projection requires the exact enrolled active student and exposes only confirmed assignment fields", async () => {
    const fixture = await createFixture("student-projection", { studentWithUser: true });
    const claim = await claimForFixture(fixture);
    await openTeachingSlotWorkflowService.review(
      authUser(fixture.manager, "program_coordinator"),
      claim.id,
      { decision: "APPROVE" },
    );
    expect(fixture.studentUser).toBeTruthy();

    const assignments = await openTeachingSlotWorkflowService.studentAssignments(fixture.studentUser!.id);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      slotId: fixture.slotId,
      offeringId: fixture.targetOffering.id,
      courseCode: fixture.targetCourse.code,
      sectionCode: fixture.sectionCode,
      kind: "reused-slot",
    });
    expect(assignments[0]).not.toHaveProperty("confidentialReason");
    expect(assignments[0]).not.toHaveProperty("attachmentRef");
    expect(assignments[0]).not.toHaveProperty("reviewComment");
    expect(assignments[0]).not.toHaveProperty("sourceLeaveRequestId");

    const outsider = await createStudent("student-projection-outsider", true);
    const outsiderAssignments = await openTeachingSlotWorkflowService.studentAssignments(outsider.user!.id);
    expect(outsiderAssignments).toEqual([]);
  });
});
