import { describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../core/auth/token.ts";
import {
  UnassignedTeachingAuthorizationError,
  UnassignedTeachingConflictError,
  unassignedTeachingRequestService,
} from "./unassigned-teaching-request-service.ts";

const enabled = process.env.UNASSIGNED_TEACHING_DB_TESTS === "1";
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

async function roleId(slug: "lecturer" | "admin" | "program_coordinator") {
  return (await prisma.role.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id;
}

async function createUser(label: string, role: "lecturer" | "admin" | "program_coordinator", programmeId: string | null) {
  const user = await prisma.user.create({
    data: {
      email: `unassigned-${label}-${crypto.randomUUID()}@example.test`,
      name: `Unassigned ${label}`,
      roleAssignments: {
        create: {
          roleId: await roleId(role),
          programmeId,
        },
      },
    },
  });
  const auth: AuthUser = {
    id: user.id,
    email: user.email!,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
  return { user, auth };
}

async function createUnassignedMeeting(label: string, options: {
  programmeId?: string;
  term?: string;
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
  primaryLecturerId?: string | null;
} = {}) {
  const programmeId = options.programmeId ?? "dse";
  const course = await prisma.course.create({
    data: {
      code: `UAR-${label}-${crypto.randomUUID().slice(0, 8)}`,
      title: `Unassigned request ${label}`,
      programmeId,
    },
  });
  const offering = await prisma.offering.create({
    data: {
      courseId: course.id,
      lecturerId: options.primaryLecturerId ?? null,
      term: options.term ?? `2026-UAR-${crypto.randomUUID().slice(0, 6)}`,
      sectionCode: "M1",
      status: "Active",
      meetings: {
        create: {
          dayOfWeek: options.dayOfWeek ?? "Monday",
          startTime: options.startTime ?? "08:00",
          endTime: options.endTime ?? "10:00",
          building: "STEM Building",
          room: "101",
          activityType: "Lecture",
        },
      },
    },
    include: { meetings: true },
  });
  return { course, offering, meeting: offering.meetings[0]! };
}

async function createAssignedConflict(userId: string, target: {
  term: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}) {
  const course = await prisma.course.create({
    data: {
      code: `UAR-CONFLICT-${crypto.randomUUID().slice(0, 8)}`,
      title: "Existing lecturer class",
      programmeId: "dse",
    },
  });
  return prisma.offering.create({
    data: {
      courseId: course.id,
      lecturerId: userId,
      term: target.term,
      sectionCode: "M2",
      status: "Active",
      meetings: {
        create: {
          dayOfWeek: target.dayOfWeek,
          startTime: target.startTime,
          endTime: target.endTime,
          activityType: "Lecture",
          lecturers: { create: { lecturerId: userId } },
        },
      },
    },
  });
}

describeDb("unassigned weekly teaching request integrity", () => {
  test("lists a real unallocated meeting for a persisted same-programme lecturer", async () => {
    const lecturer = await createUser("available", "lecturer", "dse");
    const fixture = await createUnassignedMeeting("available");

    const available = await unassignedTeachingRequestService.available(lecturer.auth);
    expect(available.some((meeting) => meeting.meetingId === fixture.meeting.id)).toBe(true);
  });

  test("rejects wrong-programme lecturers, duplicate pending requests, allocated meetings, and timetable conflicts", async () => {
    const otherProgrammeId = `uar-${crypto.randomUUID()}`;
    await prisma.programme.create({
      data: {
        id: otherProgrammeId,
        code: `UAR-${crypto.randomUUID().slice(0, 8)}`,
        name: "Other programme for assignment request test",
      },
    });
    const wrongProgramme = await createUser("wrong-programme", "lecturer", otherProgrammeId);
    const target = await createUnassignedMeeting("wrong-programme");

    await expect(
      unassignedTeachingRequestService.submit(wrongProgramme.auth, target.meeting.id),
    ).rejects.toBeInstanceOf(UnassignedTeachingAuthorizationError);

    const lecturer = await createUser("duplicate", "lecturer", "dse");
    const duplicateTarget = await createUnassignedMeeting("duplicate");
    const first = await unassignedTeachingRequestService.submit(lecturer.auth, duplicateTarget.meeting.id);
    expect(first.status).toBe("PENDING");
    await expect(
      unassignedTeachingRequestService.submit(lecturer.auth, duplicateTarget.meeting.id),
    ).rejects.toBeInstanceOf(UnassignedTeachingConflictError);

    const allocated = await createUnassignedMeeting("allocated", { primaryLecturerId: lecturer.user.id });
    await prisma.offeringMeetingLecturer.create({
      data: { meetingId: allocated.meeting.id, lecturerId: lecturer.user.id },
    });
    await expect(
      unassignedTeachingRequestService.submit(lecturer.auth, allocated.meeting.id),
    ).rejects.toThrow("already has an assigned lecturer");

    const conflictTarget = await createUnassignedMeeting("conflict", {
      term: `2026-CONFLICT-${crypto.randomUUID().slice(0, 6)}`,
      dayOfWeek: "Wednesday",
      startTime: "10:00",
      endTime: "12:00",
    });
    await createAssignedConflict(lecturer.user.id, {
      term: conflictTarget.offering.term,
      dayOfWeek: "Wednesday",
      startTime: "11:00",
      endTime: "13:00",
    });
    await expect(
      unassignedTeachingRequestService.submit(lecturer.auth, conflictTarget.meeting.id),
    ).rejects.toThrow("overlaps another weekly class");
  });

  test("fails closed for stale lecturer tokens, wrong-programme reviewers, and self-review", async () => {
    const fixture = await createUnassignedMeeting("auth-boundaries");

    const nonLecturer = await createUser("stale-token-user", "program_coordinator", "dse");
    const staleLecturerToken: AuthUser = {
      id: nonLecturer.user.id,
      email: nonLecturer.user.email!,
      roles: ["lecturer"],
      programmeRoles: [{ role: "lecturer", programmeId: "dse" }],
    };
    await expect(
      unassignedTeachingRequestService.submit(staleLecturerToken, fixture.meeting.id),
    ).rejects.toBeInstanceOf(UnassignedTeachingAuthorizationError);

    const lecturer = await createUser("auth-requester", "lecturer", "dse");
    const submitted = await unassignedTeachingRequestService.submit(lecturer.auth, fixture.meeting.id);

    const otherProgrammeId = `uar-review-${crypto.randomUUID()}`;
    await prisma.programme.create({
      data: {
        id: otherProgrammeId,
        code: `URV-${crypto.randomUUID().slice(0, 8)}`,
        name: "Other review programme",
      },
    });
    const wrongManager = await createUser("wrong-reviewer", "program_coordinator", otherProgrammeId);
    await expect(
      unassignedTeachingRequestService.getForReview(wrongManager.auth, submitted.id),
    ).rejects.toBeInstanceOf(UnassignedTeachingAuthorizationError);
    await expect(
      unassignedTeachingRequestService.review(wrongManager.auth, submitted.id, { decision: "APPROVE" }),
    ).rejects.toBeInstanceOf(UnassignedTeachingAuthorizationError);

    await prisma.userRoleAssignment.create({
      data: {
        userId: lecturer.user.id,
        roleId: await roleId("admin"),
        programmeId: null,
      },
    });
    const selfReviewer: AuthUser = {
      id: lecturer.user.id,
      email: lecturer.user.email!,
      roles: ["lecturer", "admin"],
      programmeRoles: [
        { role: "lecturer", programmeId: "dse" },
        { role: "admin", programmeId: null },
      ],
    };
    await expect(
      unassignedTeachingRequestService.getForReview(selfReviewer, submitted.id),
    ).rejects.toThrow("cannot review their own");
    await expect(
      unassignedTeachingRequestService.review(selfReviewer, submitted.id, { decision: "APPROVE" }),
    ).rejects.toThrow("cannot review their own");
  });

  test("rejecting a request preserves the unallocated meeting and does not add the lecturer to the Offering team", async () => {
    const lecturer = await createUser("reject-lecturer", "lecturer", "dse");
    const admin = await createUser("reject-admin", "admin", null);
    const fixture = await createUnassignedMeeting("reject");

    const submitted = await unassignedTeachingRequestService.submit(lecturer.auth, fixture.meeting.id);
    const reviewed = await unassignedTeachingRequestService.review(admin.auth, submitted.id, {
      decision: "REJECT",
      comment: "Another assignment is planned.",
    });

    expect(reviewed.changed).toBe(true);
    expect(reviewed.request.status).toBe("REJECTED");
    expect(
      await prisma.offeringMeetingLecturer.count({ where: { meetingId: fixture.meeting.id } }),
    ).toBe(0);
    expect(
      await prisma.offeringCoLecturer.count({
        where: { offeringId: fixture.offering.id, lecturerId: lecturer.user.id },
      }),
    ).toBe(0);
  });

  test("serializes competing approvals, assigns exactly one lecturer, and supersedes the stale request", async () => {
    const firstLecturer = await createUser("race-first", "lecturer", "dse");
    const secondLecturer = await createUser("race-second", "lecturer", "dse");
    const firstAdmin = await createUser("race-admin-1", "admin", null);
    const secondAdmin = await createUser("race-admin-2", "admin", null);
    const fixture = await createUnassignedMeeting("race");

    const [firstRequest, secondRequest] = await Promise.all([
      unassignedTeachingRequestService.submit(firstLecturer.auth, fixture.meeting.id),
      unassignedTeachingRequestService.submit(secondLecturer.auth, fixture.meeting.id),
    ]);

    await Promise.all([
      unassignedTeachingRequestService.review(firstAdmin.auth, firstRequest.id, { decision: "APPROVE" }),
      unassignedTeachingRequestService.review(secondAdmin.auth, secondRequest.id, { decision: "APPROVE" }),
    ]);

    const reloaded = await prisma.$queryRaw<Array<{ id: string; status: string; requesterId: string }>>`
      SELECT "id","status","requesterId"
      FROM "pms_attendance"."OfferingMeetingTeachingRequest"
      WHERE "id" IN (${firstRequest.id}, ${secondRequest.id})
      ORDER BY "id"
    `;
    expect(reloaded.filter((request) => request.status === "APPROVED")).toHaveLength(1);
    expect(reloaded.filter((request) => request.status === "SUPERSEDED")).toHaveLength(1);

    const ownership = await prisma.offeringMeetingLecturer.findMany({
      where: { meetingId: fixture.meeting.id },
      select: { lecturerId: true },
    });
    expect(ownership).toHaveLength(1);
    const approved = reloaded.find((request) => request.status === "APPROVED")!;
    expect(ownership[0]?.lecturerId).toBe(approved.requesterId);

    expect(
      await prisma.offeringCoLecturer.count({
        where: { offeringId: fixture.offering.id, lecturerId: approved.requesterId },
      }),
    ).toBe(1);
  });

  test("audit history is append-only", async () => {
    const lecturer = await createUser("audit-lecturer", "lecturer", "dse");
    const fixture = await createUnassignedMeeting("audit");
    const submitted = await unassignedTeachingRequestService.submit(lecturer.auth, fixture.meeting.id);

    const audit = await prisma.$queryRaw<Array<{ id: string; action: string }>>`
      SELECT "id","action"
      FROM "pms_attendance"."OfferingMeetingTeachingRequestAuditEvent"
      WHERE "requestId" = ${submitted.id}
      ORDER BY "createdAt"
    `;
    expect(audit.map((event) => event.action)).toEqual(["SUBMITTED"]);

    let rejected = false;
    try {
      await prisma.$executeRaw`
        UPDATE "pms_attendance"."OfferingMeetingTeachingRequestAuditEvent"
        SET "details"='{"tampered":true}'::jsonb
        WHERE "id"=${audit[0]!.id}
      `;
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });
});
