import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { classResponsibilityService } from "./class-responsibility-service.ts";
import { teachingSessionDeliveryService } from "./teaching-session-delivery-service.ts";

const dbTestsEnabled = process.env.TEACHING_SESSION_DELIVERY_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();

async function createUser(label: string) {
  return prisma.user.create({
    data: {
      email: `session-record-${label}-${crypto.randomUUID()}@example.test`,
      name: `Session Record ${label}`,
    },
  });
}

async function createFixture(label: string) {
  const lecturer = await createUser(`${label}-lecturer`);
  const assigningActor = await createUser(`${label}-assigner`);
  const monitorUser = await createUser(`${label}-monitor`);
  const ordinaryUser = await createUser(`${label}-ordinary`);

  const course = await prisma.course.create({
    data: {
      code: `REC-${crypto.randomUUID().slice(0, 8)}`,
      title: `Monitor record ${label}`,
      programmeId: "dse",
      lecturerId: lecturer.id,
    },
  });
  const plannedWeekId = crypto.randomUUID();
  const spec = await prisma.courseSpec.create({
    data: {
      courseId: course.id,
      revisionTriggers: [],
      reviewStatus: "Approved",
      approvedAt: new Date("2026-09-01T00:00:00.000Z"),
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
      lecturerId: lecturer.id,
      term: `2026-${label}-${crypto.randomUUID().slice(0, 6)}`,
      sectionCode: "A",
      status: "Active",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-30T00:00:00.000Z"),
      meetings: {
        create: {
          dayOfWeek: "Tuesday",
          startTime: "09:00",
          endTime: "11:00",
          room: "R401",
          activityType: "Lecture",
        },
      },
    },
    include: { meetings: true },
  });

  const monitorStudent = await prisma.student.create({
    data: {
      email: `session-record-monitor-${crypto.randomUUID()}@example.test`,
      name: "Monitor Student",
      studentId: `REC-M-${crypto.randomUUID().slice(0, 8)}`,
      status: "Active",
      userId: monitorUser.id,
    },
  });
  const ordinaryStudent = await prisma.student.create({
    data: {
      email: `session-record-ordinary-${crypto.randomUUID()}@example.test`,
      name: "Ordinary Student",
      studentId: `REC-O-${crypto.randomUUID().slice(0, 8)}`,
      status: "Active",
      userId: ordinaryUser.id,
    },
  });
  await prisma.enrollment.createMany({
    data: [
      { offeringId: offering.id, studentId: monitorStudent.id },
      { offeringId: offering.id, studentId: ordinaryStudent.id },
    ],
  });
  const assignment = await classResponsibilityService.assign(
    offering.id,
    monitorStudent.id,
    "ClassMonitor",
    assigningActor.id,
  );

  return {
    lecturer,
    assigningActor,
    monitorUser,
    ordinaryUser,
    offering,
    meeting: offering.meetings[0]!,
    assignment,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describeDb("student monitor session record", () => {
  test("atomically records neutral lecturer arrival and auditable weekly learning without attendance writes", async () => {
    const fixture = await createFixture("complete");
    const attendanceBefore = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "pms_attendance"."AttendanceRecord"
    `;

    const saved = await teachingSessionDeliveryService.saveMonitorDelivery(
      fixture.offering.id,
      fixture.meeting.id,
      "2026-09-08",
      {
        lecturerArrivalStatus: "Present",
        classOccurred: true,
        actualLecturerId: fixture.lecturer.id,
        actualStartTime: "09:05",
        actualEndTime: "10:35",
        actualTopic: "Forecasting baselines",
        learningSummary: "We compared naive and seasonal-naive forecasting baselines.",
        coverage: "PARTIALLY_COVERED",
        note: "Private monitor note for authorized staff only",
      },
      fixture.monitorUser.id,
    );

    expect(saved.changed).toBe(true);
    expect(saved.delivery.learningSummary).toBe(
      "We compared naive and seasonal-naive forecasting baselines.",
    );
    expect(saved.delivery.note).toBe("Private monitor note for authorized staff only");

    const context = await teachingSessionDeliveryService.monitorContext(
      fixture.offering.id,
      fixture.meeting.id,
      "2026-09-08",
      fixture.monitorUser.id,
    );
    expect(context.lecturerArrival?.status).toBe("Present");
    expect(context.delivery?.learningSummary).toBe(saved.delivery.learningSummary);
    expect(context.plannedWeek?.week).toBe(2);
    expect(context.history).toHaveLength(1);
    expect(context.history[0]?.newSnapshot.learningSummary).toBe(saved.delivery.learningSummary);
    expect(context.history[0]?.newSnapshot.note).toBe("Private monitor note for authorized staff only");

    const unchanged = await teachingSessionDeliveryService.saveMonitorDelivery(
      fixture.offering.id,
      fixture.meeting.id,
      "2026-09-08",
      {
        lecturerArrivalStatus: "Present",
        classOccurred: true,
        actualLecturerId: fixture.lecturer.id,
        actualStartTime: "09:05",
        actualEndTime: "10:35",
        actualTopic: "Forecasting baselines",
        learningSummary: "We compared naive and seasonal-naive forecasting baselines.",
        coverage: "PARTIALLY_COVERED",
        note: "Private monitor note for authorized staff only",
      },
      fixture.monitorUser.id,
    );
    expect(unchanged.changed).toBe(false);
    expect(await teachingSessionDeliveryService.getHistory(saved.delivery.occurrenceId)).toHaveLength(1);

    const attendanceAfter = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "pms_attendance"."AttendanceRecord"
    `;
    expect(attendanceAfter[0]?.count).toBe(attendanceBefore[0]?.count);
  });

  test("ordinary and revoked students fail closed", async () => {
    const fixture = await createFixture("auth");
    const input = {
      lecturerArrivalStatus: "NotYet" as const,
      classOccurred: false,
      actualLecturerId: null,
      actualStartTime: null,
      actualEndTime: null,
      actualTopic: "",
      learningSummary: "",
      coverage: "NOT_COVERED" as const,
      note: "",
    };

    await expect(
      teachingSessionDeliveryService.saveMonitorDelivery(
        fixture.offering.id,
        fixture.meeting.id,
        "2026-09-08",
        input,
        fixture.ordinaryUser.id,
      ),
    ).rejects.toThrow("not an active class monitor");

    await classResponsibilityService.revoke(
      fixture.offering.id,
      fixture.assignment.id,
      fixture.assigningActor.id,
      "End test responsibility",
    );
    await expect(
      teachingSessionDeliveryService.saveMonitorDelivery(
        fixture.offering.id,
        fixture.meeting.id,
        "2026-09-08",
        input,
        fixture.monitorUser.id,
      ),
    ).rejects.toThrow("not an active class monitor");
  });
});
