import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { isNewAttendanceDateEligible } from "./attendance-service.ts";
import type { AuthUser } from "../../core/auth/token.ts";
import {
  MakeUpClassConflictError, MakeUpClassForbiddenError, makeUpClassService,
} from "./make-up-class-service.ts";

const describeDb = process.env.CLASS_DELIVERY_DB_TESTS === "1" ? describe : describe.skip;
const prisma = new PrismaClient();

const userIds: string[] = [];
const offeringIds: string[] = [];
const courseIds: string[] = [];

const auth = (id: string, role: "lecturer" | "program_coordinator", programmeId = "dse"): AuthUser => ({
  id, email: `${id}@example.test`,
  roles: [role], programmeRoles: [{ role, programmeId }],
});

async function fixture(label: string) {
  const lecturer = await prisma.user.create({
    data: { name: "Make-up lecturer", email: `makeup-lecturer-${label}-${crypto.randomUUID()}@example.test` },
  });
  const coordinator = await prisma.user.create({
    data: { name: "Make-up reviewer", email: `makeup-reviewer-${label}-${crypto.randomUUID()}@example.test` },
  });
  const stranger = await prisma.user.create({
    data: { name: "Make-up stranger", email: `makeup-stranger-${label}-${crypto.randomUUID()}@example.test` },
  });
  userIds.push(lecturer.id, coordinator.id, stranger.id);
  const course = await prisma.course.create({
    data: { code: `MK-${crypto.randomUUID().slice(0, 7)}`, title: "Make-up DB fixture", programmeId: "dse" },
  });
  courseIds.push(course.id);
  const offering = await prisma.offering.create({
    data: {
      courseId: course.id, lecturerId: lecturer.id,
      term: `2026-MK-${crypto.randomUUID().slice(0, 5)}`, sectionCode: "M1",
      status: "Active",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      meetings: { create: { dayOfWeek: "Monday", startTime: "08:00", endTime: "12:00", room: `R-${label}` } },
    },
    include: { meetings: true },
  });
  offeringIds.push(offering.id);
  return {
    lecturer: auth(lecturer.id, "lecturer"),
    reviewer: auth(coordinator.id, "program_coordinator"),
    stranger: auth(stranger.id, "lecturer", "other"),
    offering, meetingId: offering.meetings[0]!.id,
  };
}

afterAll(async () => {
  if (offeringIds.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "pms_attendance"."MakeUpClassRequest" WHERE "offeringId" = ANY($1::text[])`, offeringIds,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "pms_attendance"."AttendanceSession" WHERE "offeringId" = ANY($1::text[])`, offeringIds,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "pms_attendance"."TeachingSessionOccurrence" WHERE "offeringId" = ANY($1::text[])`, offeringIds,
    );
    await prisma.offering.deleteMany({ where: { id: { in: offeringIds } } });
  }
  if (courseIds.length) await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describeDb("make-up class requests and approved attendance dates", () => {
  test("only an assigned lecturer may propose and another in-programme reviewer may approve", async () => {
    const f = await fixture("approve");
    const input = {
      offeringId: f.offering.id, offeringMeetingId: f.meetingId,
      originalDate: "2026-11-16", replacementDate: "2026-11-21",
      startTime: "08:00", endTime: "12:00", room: f.offering.meetings[0]!.room!, note: "Recover missed Monday session",
    };
    await expect(makeUpClassService.propose(f.stranger, input)).rejects.toThrow(MakeUpClassForbiddenError);
    const proposed = await makeUpClassService.propose(f.lecturer, input);
    expect(proposed.status).toBe("PENDING");
    expect(await isNewAttendanceDateEligible(f.offering.id, "2026-11-16")).toBe(true);
    expect(await isNewAttendanceDateEligible(f.offering.id, "2026-11-21")).toBe(false);
    expect(await makeUpClassService.approvedForDate(f.lecturer, "2026-11-21")).toEqual([]);

    await expect(makeUpClassService.review(f.lecturer, proposed.id, {
      decision: "APPROVE", confirmedMissed: true,
    })).rejects.toThrow(MakeUpClassForbiddenError);
    const outsider = auth(f.stranger.id, "program_coordinator", "other");
    await expect(makeUpClassService.review(outsider, proposed.id, {
      decision: "APPROVE", confirmedMissed: true,
    })).rejects.toThrow(MakeUpClassForbiddenError);

    const approved = await makeUpClassService.review(f.reviewer, proposed.id, {
      decision: "APPROVE", confirmedMissed: true,
    });
    expect(approved.status).toBe("APPROVED");
    expect(await isNewAttendanceDateEligible(f.offering.id, "2026-11-21")).toBe(true);
    expect(approved.originalOccurrenceId).toBe(proposed.originalOccurrenceId);
    expect(await makeUpClassService.approvedForDate(f.lecturer, "2026-11-21")).toEqual([{
      id: approved.id, offeringId: f.offering.id,
      originalDate: "2026-11-16", replacementDate: "2026-11-21",
      startTime: "08:00", endTime: "12:00", room: f.offering.meetings[0]!.room!,
    }]);
    expect(await makeUpClassService.approvedForDate(f.stranger, "2026-11-21")).toEqual([]);
    await expect(makeUpClassService.review(f.reviewer, proposed.id, {
      decision: "APPROVE", confirmedMissed: true,
    })).rejects.toThrow(MakeUpClassConflictError);
  });

  test("blocks duplicate recovery and another register on a recurring day", async () => {
    const f = await fixture("conflict");
    const input = {
      offeringId: f.offering.id, offeringMeetingId: f.meetingId,
      originalDate: "2026-11-16", replacementDate: "2026-11-21",
      startTime: "08:00", endTime: "12:00", note: "Recover missed class",
    };
    await makeUpClassService.propose(f.lecturer, input);
    await expect(makeUpClassService.propose(f.lecturer, input)).rejects.toThrow(MakeUpClassConflictError);
    await expect(makeUpClassService.propose(f.lecturer, {
      ...input, replacementDate: "2026-11-23",
    })).rejects.toThrow(MakeUpClassConflictError);
  });

  test("cannot approve recovery when the original attendance register exists", async () => {
    const f = await fixture("attendance");
    const proposed = await makeUpClassService.propose(f.lecturer, {
      offeringId: f.offering.id, offeringMeetingId: f.meetingId,
      originalDate: "2026-11-16", replacementDate: "2026-11-21",
      startTime: "08:00", endTime: "12:00", note: "Needs review",
    });
    await prisma.$executeRaw`
      INSERT INTO "pms_attendance"."AttendanceSession" ("id","offeringId","sessionDate")
      VALUES (${crypto.randomUUID()},${f.offering.id},'2026-11-16'::date)
    `;
    await expect(makeUpClassService.review(f.reviewer, proposed.id, {
      decision: "APPROVE", confirmedMissed: true,
    })).rejects.toThrow(MakeUpClassConflictError);
  });
});
