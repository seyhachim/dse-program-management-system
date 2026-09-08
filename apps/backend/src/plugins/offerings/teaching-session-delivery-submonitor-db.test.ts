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
      email: `delivery-submonitor-${label}-${crypto.randomUUID()}@example.test`,
      name: `Delivery Submonitor ${label}`,
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describeDb("sub-class monitor teaching delivery authority", () => {
  test("an active enrolled SubClassMonitor can record the exact occurrence", async () => {
    const actor = await createUser("actor");
    const monitorUser = await createUser("user");
    const lead = await createUser("lead");
    const student = await prisma.student.create({
      data: {
        email: `delivery-submonitor-student-${crypto.randomUUID()}@example.test`,
        name: "Delivery Submonitor Student",
        studentId: `DEL-SUB-${crypto.randomUUID().slice(0, 6)}`,
        status: "Active",
        userId: monitorUser.id,
      },
    });
    const course = await prisma.course.create({
      data: {
        code: `DEL-SUB-${crypto.randomUUID().slice(0, 7)}`,
        title: "Submonitor delivery",
        programmeId: "dse",
      },
    });
    const offering = await prisma.offering.create({
      data: {
        courseId: course.id,
        lecturerId: lead.id,
        term: `2026-sub-${crypto.randomUUID().slice(0, 6)}`,
        sectionCode: "A",
        status: "Active",
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2026-09-30T00:00:00.000Z"),
        meetings: {
          create: [{ dayOfWeek: "Tuesday", startTime: "09:00", endTime: "11:00" }],
        },
      },
      include: { meetings: true },
    });
    await prisma.enrollment.create({ data: { offeringId: offering.id, studentId: student.id } });
    await classResponsibilityService.assign(
      offering.id,
      student.id,
      "SubClassMonitor",
      actor.id,
    );

    const result = await teachingSessionDeliveryService.saveMonitorDelivery(
      offering.id,
      offering.meetings[0]!.id,
      "2026-09-08",
      {
        classOccurred: false,
        actualLecturerId: null,
        actualStartTime: null,
        actualEndTime: null,
        actualTopic: "",
        coverage: "NOT_COVERED",
        note: "Class did not occur",
      },
      monitorUser.id,
    );

    expect(result.changed).toBe(true);
    expect(result.delivery.classOccurred).toBe(false);
    expect((await teachingSessionDeliveryService.listMonitorAssignments(monitorUser.id))[0]).toEqual({
      offeringId: offering.id,
      role: "SubClassMonitor",
    });
  });
});
