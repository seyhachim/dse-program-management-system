import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { classDeliveryService } from "./class-delivery-service.ts";

const dbTestsEnabled = process.env.CLASS_DELIVERY_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();

const userIds = new Set<string>();
const offeringIds = new Set<string>();
const courseIds = new Set<string>();

async function createUser(label: string) {
  const user = await prisma.user.create({
    data: {
      email: `occurrence-${label}-${crypto.randomUUID()}@example.test`,
      name: `Occurrence ${label}`,
    },
  });
  userIds.add(user.id);
  return user;
}

async function createOffering(
  label: string,
  meetings: Array<{
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    room?: string;
    activityType?: string;
  }> = [
    {
      dayOfWeek: "Tuesday",
      startTime: "09:00",
      endTime: "11:00",
      room: "R301",
      activityType: "Lecture",
    },
  ],
) {
  const course = await prisma.course.create({
    data: {
      code: `OCC-${label}-${crypto.randomUUID().slice(0, 8)}`,
      title: `Occurrence ${label}`,
      programmeId: "dse",
    },
  });
  courseIds.add(course.id);

  const offering = await prisma.offering.create({
    data: {
      courseId: course.id,
      term: `2026-${label}-${crypto.randomUUID().slice(0, 6)}`,
      sectionCode: "A",
      status: "Active",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-30T00:00:00.000Z"),
      meetings: {
        create: meetings.map((meeting) => ({
          dayOfWeek: meeting.dayOfWeek,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          room: meeting.room,
          activityType: meeting.activityType ?? "Lecture",
        })),
      },
    },
    include: { meetings: { orderBy: { startTime: "asc" } } },
  });
  offeringIds.add(offering.id);
  return offering;
}

afterAll(async () => {
  if (offeringIds.size > 0) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "pms_attendance"."ClassSessionStatus" WHERE "offeringId" = ANY($1::text[])`,
      [...offeringIds],
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "pms_attendance"."LecturerArrivalConfirmation" WHERE "offeringId" = ANY($1::text[])`,
      [...offeringIds],
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "pms_attendance"."TeachingSessionOccurrence" WHERE "offeringId" = ANY($1::text[])`,
      [...offeringIds],
    );
    await prisma.offering.deleteMany({ where: { id: { in: [...offeringIds] } } });
  }
  if (courseIds.size > 0) await prisma.course.deleteMany({ where: { id: { in: [...courseIds] } } });
  if (userIds.size > 0) await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
  await prisma.$disconnect();
});

describeDb("teaching session occurrence persistence", () => {
  test("resolves one exact recurring meeting/date idempotently with schedule snapshot", async () => {
    const offering = await createOffering("idempotent");
    const meeting = offering.meetings[0]!;

    const first = await classDeliveryService.resolveTeachingSessionOccurrence(
      offering.id,
      meeting.id,
      "2026-09-08",
    );
    const repeated = await classDeliveryService.resolveTeachingSessionOccurrence(
      offering.id,
      meeting.id,
      "2026-09-08",
    );

    expect(repeated.id).toBe(first.id);
    expect(first).toMatchObject({
      offeringId: offering.id,
      offeringMeetingId: meeting.id,
      date: "2026-09-08",
      scheduledDayOfWeek: "Tuesday",
      scheduledStartTime: "09:00",
      scheduledEndTime: "11:00",
      scheduledRoom: "R301",
      scheduledActivityType: "Lecture",
    });
    expect(
      await classDeliveryService.getTeachingSessionOccurrence(offering.id, meeting.id, "2026-09-08"),
    ).toEqual(first);
  });

  test("rejects wrong weekday, outside teaching period, and meeting from another offering", async () => {
    const offering = await createOffering("validation");
    const other = await createOffering("validation-other");
    const meeting = offering.meetings[0]!;

    await expect(
      classDeliveryService.resolveTeachingSessionOccurrence(offering.id, meeting.id, "2026-09-09"),
    ).rejects.toThrow("scheduled for Tuesday");
    await expect(
      classDeliveryService.resolveTeachingSessionOccurrence(offering.id, meeting.id, "2026-10-06"),
    ).rejects.toThrow("outside the offering teaching period");
    await expect(
      classDeliveryService.resolveTeachingSessionOccurrence(other.id, meeting.id, "2026-09-08"),
    ).rejects.toThrow("Offering meeting not found for this offering");
  });

  test("supports multiple meetings for one offering on the same date", async () => {
    const offering = await createOffering("same-day", [
      { dayOfWeek: "Tuesday", startTime: "09:00", endTime: "10:00", activityType: "Lecture" },
      { dayOfWeek: "Tuesday", startTime: "14:00", endTime: "16:00", activityType: "Lab" },
    ]);

    const first = await classDeliveryService.resolveTeachingSessionOccurrence(
      offering.id,
      offering.meetings[0]!.id,
      "2026-09-08",
    );
    const second = await classDeliveryService.resolveTeachingSessionOccurrence(
      offering.id,
      offering.meetings[1]!.id,
      "2026-09-08",
    );

    expect(first.id).not.toBe(second.id);
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."TeachingSessionOccurrence"
      WHERE "offeringId" = ${offering.id} AND "sessionDate" = '2026-09-08'::date
    `;
    expect(Number(rows[0]?.count ?? 0n)).toBe(2);
  });

  test("links unambiguous legacy evidence but leaves same-day ambiguity unresolved", async () => {
    const actor = await createUser("legacy-link");
    const unambiguous = await createOffering("legacy-unambiguous");
    const date = "2026-09-08";

    await classDeliveryService.saveLecturerArrival(
      unambiguous.id,
      date,
      "Present",
      "Legacy evidence",
      actor.id,
    );
    const occurrence = await classDeliveryService.resolveTeachingSessionOccurrence(
      unambiguous.id,
      unambiguous.meetings[0]!.id,
      date,
    );
    const linked = await prisma.$queryRaw<Array<{ occurrenceId: string | null }>>`
      SELECT "occurrenceId"
      FROM "pms_attendance"."LecturerArrivalConfirmation"
      WHERE "offeringId" = ${unambiguous.id} AND "date" = ${date}::date
    `;
    expect(linked[0]?.occurrenceId).toBe(occurrence.id);

    const ambiguous = await createOffering("legacy-ambiguous", [
      { dayOfWeek: "Tuesday", startTime: "08:00", endTime: "09:00" },
      { dayOfWeek: "Tuesday", startTime: "10:00", endTime: "11:00" },
    ]);
    await classDeliveryService.saveLecturerArrival(
      ambiguous.id,
      date,
      "NotYet",
      "Ambiguous legacy evidence",
      actor.id,
    );
    await classDeliveryService.resolveTeachingSessionOccurrence(
      ambiguous.id,
      ambiguous.meetings[0]!.id,
      date,
    );
    const unresolved = await prisma.$queryRaw<Array<{ occurrenceId: string | null }>>`
      SELECT "occurrenceId"
      FROM "pms_attendance"."LecturerArrivalConfirmation"
      WHERE "offeringId" = ${ambiguous.id} AND "date" = ${date}::date
    `;
    expect(unresolved[0]?.occurrenceId).toBeNull();
  });

  test("occurrence-aware arrival/status allow separate evidence for two same-day meetings", async () => {
    const actor = await createUser("exact-evidence");
    const offering = await createOffering("exact-evidence", [
      { dayOfWeek: "Tuesday", startTime: "08:00", endTime: "09:00" },
      { dayOfWeek: "Tuesday", startTime: "13:00", endTime: "14:00" },
    ]);
    const occurrences = await Promise.all(
      offering.meetings.map((meeting) =>
        classDeliveryService.resolveTeachingSessionOccurrence(offering.id, meeting.id, "2026-09-08"),
      ),
    );

    await Promise.all(
      occurrences.map((occurrence) =>
        classDeliveryService.saveLecturerArrivalForOccurrence(
          occurrence.id,
          "Present",
          `Arrival ${occurrence.scheduledStartTime}`,
          actor.id,
        ),
      ),
    );
    await Promise.all(
      occurrences.map((occurrence) =>
        classDeliveryService.saveClassSessionStatusForOccurrence(
          occurrence.id,
          "Scheduled",
          "",
          actor.id,
        ),
      ),
    );

    const arrivalRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."LecturerArrivalConfirmation"
      WHERE "offeringId" = ${offering.id} AND "date" = '2026-09-08'::date
    `;
    const sessionRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."ClassSessionStatus"
      WHERE "offeringId" = ${offering.id} AND "date" = '2026-09-08'::date
    `;
    expect(Number(arrivalRows[0]?.count ?? 0n)).toBe(2);
    expect(Number(sessionRows[0]?.count ?? 0n)).toBe(2);
  });
});
