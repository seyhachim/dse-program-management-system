import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { classResponsibilityService } from "./class-responsibility-service.ts";
import {
  TeachingSessionDeliveryValidationError,
  teachingSessionDeliveryService,
} from "./teaching-session-delivery-service.ts";

const dbTestsEnabled = process.env.TEACHING_SESSION_DELIVERY_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();

async function createUser(label: string) {
  return prisma.user.create({
    data: {
      email: `delivery-${label}-${crypto.randomUUID()}@example.test`,
      name: `Delivery ${label}`,
    },
  });
}

async function createStudent(label: string, userId: string) {
  return prisma.student.create({
    data: {
      email: `delivery-student-${label}-${crypto.randomUUID()}@example.test`,
      name: `Delivery Student ${label}`,
      studentId: `DEL-${label}-${crypto.randomUUID().slice(0, 6)}`,
      status: "Active",
      userId,
    },
  });
}

async function createDeliveryOffering(label: string) {
  const lead = await createUser(`${label}-lead`);
  const co = await createUser(`${label}-co`);
  const course = await prisma.course.create({
    data: {
      code: `DEL-${label}-${crypto.randomUUID().slice(0, 7)}`,
      title: `Delivery ${label}`,
      programmeId: "dse",
      lecturerId: lead.id,
    },
  });
  const plannedWeekId = crypto.randomUUID();
  const spec = await prisma.courseSpec.create({
    data: {
      courseId: course.id,
      revisionTriggers: [],
      reviewStatus: "Approved",
      approvedAt: new Date("2026-08-20T00:00:00.000Z"),
      weeks: {
        create: [
          {
            id: plannedWeekId,
            order: 0,
            week: 2,
            topic: "Planned Week 2 topic",
            cloCodes: ["CLO1"],
          },
        ],
      },
    },
  });
  const offering = await prisma.offering.create({
    data: {
      courseId: course.id,
      courseSpecId: spec.id,
      lecturerId: lead.id,
      term: `2026-${label}-${crypto.randomUUID().slice(0, 6)}`,
      sectionCode: "A",
      status: "Active",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-30T00:00:00.000Z"),
      coLecturers: { create: [{ lecturerId: co.id }] },
      meetings: {
        create: [
          {
            dayOfWeek: "Tuesday",
            startTime: "09:00",
            endTime: "11:00",
            room: "R301",
            activityType: "Lecture",
          },
        ],
      },
    },
    include: { meetings: true },
  });
  return { course, spec, offering, meeting: offering.meetings[0]!, lead, co, plannedWeekId };
}

async function assignMonitor(offeringId: string, label: string) {
  const actor = await createUser(`${label}-actor`);
  const user = await createUser(`${label}-monitor-user`);
  const student = await createStudent(label, user.id);
  await prisma.enrollment.create({ data: { offeringId, studentId: student.id } });
  const assignment = await classResponsibilityService.assign(
    offeringId,
    student.id,
    "ClassMonitor",
    actor.id,
  );
  return { actor, user, student, assignment };
}

afterAll(async () => {
  // This suite deliberately creates Approved CourseSpec history and append-only
  // delivery-audit evidence. It is therefore intended for the isolated CI database
  // selected by TEACHING_SESSION_DELIVERY_DB_TESTS rather than a developer database.
  await prisma.$disconnect();
});

describeDb("monitor teaching session delivery integrity", () => {
  test("resolves the exact occurrence, snapshots planned Week content, and derives contact time", async () => {
    const fixture = await createDeliveryOffering("planned");
    const monitor = await assignMonitor(fixture.offering.id, "planned");

    const context = await teachingSessionDeliveryService.monitorContext(
      fixture.offering.id,
      fixture.meeting.id,
      "2026-09-08",
      monitor.user.id,
    );
    expect(context.responsibility.role).toBe("ClassMonitor");
    expect(context.occurrence.offeringMeetingId).toBe(fixture.meeting.id);
    expect(context.plannedWeek).toEqual({
      courseSpecId: fixture.spec.id,
      id: fixture.plannedWeekId,
      week: 2,
      topic: "Planned Week 2 topic",
    });
    expect(context.eligibleLecturers.map((lecturer) => lecturer.id).sort()).toEqual(
      [fixture.lead.id, fixture.co.id].sort(),
    );

    const saved = await teachingSessionDeliveryService.saveMonitorDelivery(
      fixture.offering.id,
      fixture.meeting.id,
      "2026-09-08",
      {
        classOccurred: true,
        actualLecturerId: fixture.lead.id,
        actualStartTime: "09:10",
        actualEndTime: "10:40",
        actualTopic: "Actual introduction and decomposition",
        coverage: "PARTIALLY_COVERED",
        note: "Remainder continues next session",
      },
      monitor.user.id,
    );

    expect(saved.changed).toBe(true);
    expect(saved.delivery.deliveredMinutes).toBe(90);
    expect(saved.delivery.deliveredContactHours).toBe(1.5);
    expect(saved.delivery.plannedWeek).toEqual(context.plannedWeek);
    expect(saved.delivery.revision).toBe(1);

    const unchanged = await teachingSessionDeliveryService.saveMonitorDelivery(
      fixture.offering.id,
      fixture.meeting.id,
      "2026-09-08",
      {
        classOccurred: true,
        actualLecturerId: fixture.lead.id,
        actualStartTime: "09:10",
        actualEndTime: "10:40",
        actualTopic: "Actual introduction and decomposition",
        coverage: "PARTIALLY_COVERED",
        note: "Remainder continues next session",
      },
      monitor.user.id,
    );
    expect(unchanged.changed).toBe(false);
    expect(unchanged.delivery.revision).toBe(1);
    expect(await teachingSessionDeliveryService.getHistory(context.occurrence.id)).toHaveLength(1);
  });

  test("retains immutable actor/time audit history for material monitor edits", async () => {
    const fixture = await createDeliveryOffering("history");
    const monitor = await assignMonitor(fixture.offering.id, "history");

    const first = await teachingSessionDeliveryService.saveMonitorDelivery(
      fixture.offering.id,
      fixture.meeting.id,
      "2026-09-08",
      {
        classOccurred: true,
        actualLecturerId: fixture.co.id,
        actualStartTime: "09:00",
        actualEndTime: "10:30",
        actualTopic: "Planned Week 2 topic",
        coverage: "TAUGHT_AS_PLANNED",
        note: "",
      },
      monitor.user.id,
    );
    const second = await teachingSessionDeliveryService.saveMonitorDelivery(
      fixture.offering.id,
      fixture.meeting.id,
      "2026-09-08",
      {
        classOccurred: true,
        actualLecturerId: fixture.co.id,
        actualStartTime: "09:00",
        actualEndTime: "10:45",
        actualTopic: "Planned Week 2 topic plus exercise",
        coverage: "PARTIALLY_COVERED",
        note: "Corrected after class",
      },
      monitor.user.id,
    );

    expect(first.delivery.revision).toBe(1);
    expect(second.delivery.revision).toBe(2);
    const history = await teachingSessionDeliveryService.getHistory(second.delivery.occurrenceId);
    expect(history).toHaveLength(2);
    expect(history[0]!.previousSnapshot).toBeNull();
    expect(history[1]!.previousSnapshot?.actualEndTime).toBe("10:30");
    expect(history[1]!.newSnapshot.actualEndTime).toBe("10:45");
    expect(history.every((entry) => entry.actor.id === monitor.user.id)).toBe(true);

    await expect(
      (async () => {
        await prisma.$executeRawUnsafe(
          `UPDATE "pms_attendance"."TeachingSessionDeliveryAuditEvent" SET "revision" = 99 WHERE "id" = $1`,
          history[0]!.id,
        );
      })(),
    ).rejects.toThrow("append-only");
  });

  test("revoked, ordinary, and cross-offering students cannot write delivery", async () => {
    const fixture = await createDeliveryOffering("auth");
    const other = await createDeliveryOffering("auth-other");
    const monitor = await assignMonitor(fixture.offering.id, "auth");

    const ordinaryUser = await createUser("ordinary-user");
    const ordinary = await createStudent("ordinary", ordinaryUser.id);
    await prisma.enrollment.create({
      data: { offeringId: fixture.offering.id, studentId: ordinary.id },
    });

    const input = {
      classOccurred: true as const,
      actualLecturerId: fixture.lead.id,
      actualStartTime: "09:00",
      actualEndTime: "10:00",
      actualTopic: "Actual topic",
      coverage: "TAUGHT_AS_PLANNED" as const,
      note: "",
    };

    await expect(
      teachingSessionDeliveryService.saveMonitorDelivery(
        fixture.offering.id,
        fixture.meeting.id,
        "2026-09-08",
        input,
        ordinaryUser.id,
      ),
    ).rejects.toThrow("not an active class monitor");

    await expect(
      teachingSessionDeliveryService.saveMonitorDelivery(
        fixture.offering.id,
        other.meeting.id,
        "2026-09-08",
        input,
        monitor.user.id,
      ),
    ).rejects.toThrow("Offering meeting not found for this offering");

    expect(
      await classResponsibilityService.revoke(
        fixture.offering.id,
        monitor.assignment.id,
        monitor.actor.id,
        "Monitor changed",
      ),
    ).toBe(true);
    await expect(
      teachingSessionDeliveryService.saveMonitorDelivery(
        fixture.offering.id,
        fixture.meeting.id,
        "2026-09-08",
        input,
        monitor.user.id,
      ),
    ).rejects.toThrow("not an active class monitor");
  });

  test("rejects unassigned lecturers and invalid actual times without touching student attendance", async () => {
    const fixture = await createDeliveryOffering("validation");
    const monitor = await assignMonitor(fixture.offering.id, "validation");
    const outsider = await createUser("outsider-lecturer");
    const attendanceBefore = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "pms_attendance"."AttendanceRecord"
    `;

    await expect(
      teachingSessionDeliveryService.saveMonitorDelivery(
        fixture.offering.id,
        fixture.meeting.id,
        "2026-09-08",
        {
          classOccurred: true,
          actualLecturerId: outsider.id,
          actualStartTime: "09:00",
          actualEndTime: "10:00",
          actualTopic: "Topic",
          coverage: "TAUGHT_AS_PLANNED",
          note: "",
        },
        monitor.user.id,
      ),
    ).rejects.toBeInstanceOf(TeachingSessionDeliveryValidationError);

    await expect(
      teachingSessionDeliveryService.saveMonitorDelivery(
        fixture.offering.id,
        fixture.meeting.id,
        "2026-09-08",
        {
          classOccurred: true,
          actualLecturerId: fixture.lead.id,
          actualStartTime: "11:00",
          actualEndTime: "10:00",
          actualTopic: "Topic",
          coverage: "TAUGHT_AS_PLANNED",
          note: "",
        },
        monitor.user.id,
      ),
    ).rejects.toThrow("Actual end time must be after actual start time");

    const attendanceAfter = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "pms_attendance"."AttendanceRecord"
    `;
    expect(attendanceAfter[0]?.count).toBe(attendanceBefore[0]?.count);
  });

  test("records a missed class explicitly with zero delivered contact time", async () => {
    const fixture = await createDeliveryOffering("missed");
    const monitor = await assignMonitor(fixture.offering.id, "missed");
    const saved = await teachingSessionDeliveryService.saveMonitorDelivery(
      fixture.offering.id,
      fixture.meeting.id,
      "2026-09-08",
      {
        classOccurred: false,
        actualLecturerId: null,
        actualStartTime: null,
        actualEndTime: null,
        actualTopic: "",
        coverage: "NOT_COVERED",
        note: "Class did not take place",
      },
      monitor.user.id,
    );
    expect(saved.delivery.classOccurred).toBe(false);
    expect(saved.delivery.deliveredMinutes).toBe(0);
    expect(saved.delivery.actualLecturer).toBeNull();
    expect(saved.delivery.coverage).toBe("NOT_COVERED");
  });
});
