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
    data: { email: `class-delivery-${label}-${crypto.randomUUID()}@example.test`, name: `Class Delivery ${label}` },
  });
  userIds.add(user.id);
  return user;
}

async function createOffering(label: string) {
  const course = await prisma.course.create({
    data: {
      code: `CD-${label}-${crypto.randomUUID().slice(0, 8)}`,
      title: `Class delivery ${label}`,
      programmeId: "dse",
    },
  });
  courseIds.add(course.id);
  const offering = await prisma.offering.create({
    data: { courseId: course.id, term: `2026-${label}-${crypto.randomUUID().slice(0, 6)}`, sectionCode: "A", status: "Active" },
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
    await prisma.offering.deleteMany({ where: { id: { in: [...offeringIds] } } });
  }
  if (courseIds.size > 0) await prisma.course.deleteMany({ where: { id: { in: [...courseIds] } } });
  if (userIds.size > 0) await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
  await prisma.$disconnect();
});

describeDb("class delivery persistence", () => {
  test("arrival note participates in idempotence and intentional changes", async () => {
    const firstActor = await createUser("arrival-first");
    const secondActor = await createUser("arrival-second");
    const offering = await createOffering("arrival-idempotent");
    const date = "2026-08-17";

    const first = await classDeliveryService.saveLecturerArrival(
      offering.id,
      date,
      "NotYet",
      "Lecturer is on the way",
      firstActor.id,
    );
    expect(first.changed).toBe(true);
    expect(first.confirmation).toMatchObject({ status: "NotYet", note: "Lecturer is on the way" });
    expect(first.confirmation.recordedBy.id).toBe(firstActor.id);

    const repeated = await classDeliveryService.saveLecturerArrival(
      offering.id,
      date,
      "NotYet",
      "Lecturer is on the way",
      secondActor.id,
    );
    expect(repeated.changed).toBe(false);
    expect(repeated.confirmation.id).toBe(first.confirmation.id);
    expect(repeated.confirmation.recordedBy.id).toBe(firstActor.id);
    expect(repeated.confirmation.recordedAt).toBe(first.confirmation.recordedAt);

    const changedNote = await classDeliveryService.saveLecturerArrival(
      offering.id,
      date,
      "NotYet",
      "Lecturer reported a short delay",
      secondActor.id,
    );
    expect(changedNote.changed).toBe(true);
    expect(changedNote.confirmation).toMatchObject({
      status: "NotYet",
      note: "Lecturer reported a short delay",
    });
    expect(changedNote.confirmation.recordedBy.id).toBe(secondActor.id);

    const present = await classDeliveryService.saveLecturerArrival(
      offering.id,
      date,
      "Present",
      "Arrived",
      secondActor.id,
    );
    expect(present.changed).toBe(true);
    expect(present.confirmation).toMatchObject({ status: "Present", note: "Arrived" });

    const loaded = await classDeliveryService.getLecturerArrival(offering.id, date);
    expect(loaded).toEqual(present.confirmation);

    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."LecturerArrivalConfirmation"
      WHERE "offeringId" = ${offering.id} AND "date" = ${date}::date
    `;
    expect(Number(rows[0]?.count ?? 0n)).toBe(1);
  });

  test("serializes concurrent same-arrival taps into one changed write and one idempotent retry", async () => {
    const firstActor = await createUser("arrival-concurrent-first");
    const secondActor = await createUser("arrival-concurrent-second");
    const offering = await createOffering("arrival-concurrent");
    const date = "2026-08-18";

    const results = await Promise.all([
      classDeliveryService.saveLecturerArrival(offering.id, date, "Present", "Here", firstActor.id),
      classDeliveryService.saveLecturerArrival(offering.id, date, "Present", "Here", secondActor.id),
    ]);

    expect(results.filter((result) => result.changed)).toHaveLength(1);
    expect(results.filter((result) => !result.changed)).toHaveLength(1);
    expect(new Set(results.map((result) => result.confirmation.id)).size).toBe(1);
    expect(new Set(results.map((result) => result.confirmation.recordedAt)).size).toBe(1);
  });

  test("stores one official session status per offering/date with idempotent reason updates", async () => {
    const firstActor = await createUser("session-first");
    const secondActor = await createUser("session-second");
    const offering = await createOffering("session-idempotent");
    const date = "2026-08-19";

    const first = await classDeliveryService.saveClassSessionStatus(
      offering.id,
      date,
      "Holiday",
      "National holiday",
      firstActor.id,
    );
    expect(first.changed).toBe(true);
    expect(first.session).toMatchObject({ status: "Holiday", reason: "National holiday" });
    expect(first.session.recordedBy.id).toBe(firstActor.id);

    const repeated = await classDeliveryService.saveClassSessionStatus(
      offering.id,
      date,
      "Holiday",
      "National holiday",
      secondActor.id,
    );
    expect(repeated.changed).toBe(false);
    expect(repeated.session.id).toBe(first.session.id);
    expect(repeated.session.recordedBy.id).toBe(firstActor.id);
    expect(repeated.session.recordedAt).toBe(first.session.recordedAt);

    const changedReason = await classDeliveryService.saveClassSessionStatus(
      offering.id,
      date,
      "Holiday",
      "Official public holiday",
      secondActor.id,
    );
    expect(changedReason.changed).toBe(true);
    expect(changedReason.session).toMatchObject({ status: "Holiday", reason: "Official public holiday" });
    expect(changedReason.session.recordedBy.id).toBe(secondActor.id);

    const rescheduled = await classDeliveryService.saveClassSessionStatus(
      offering.id,
      date,
      "Rescheduled",
      "Moved to Friday",
      secondActor.id,
    );
    expect(rescheduled.changed).toBe(true);
    expect(rescheduled.session).toMatchObject({ status: "Rescheduled", reason: "Moved to Friday" });

    expect(await classDeliveryService.getClassSessionStatus(offering.id, date)).toEqual(rescheduled.session);

    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."ClassSessionStatus"
      WHERE "offeringId" = ${offering.id} AND "date" = ${date}::date
    `;
    expect(Number(rows[0]?.count ?? 0n)).toBe(1);
  });

  test("serializes concurrent same-session taps", async () => {
    const firstActor = await createUser("session-concurrent-first");
    const secondActor = await createUser("session-concurrent-second");
    const offering = await createOffering("session-concurrent");
    const date = "2026-08-20";

    const results = await Promise.all([
      classDeliveryService.saveClassSessionStatus(offering.id, date, "Cancelled", "Flooding", firstActor.id),
      classDeliveryService.saveClassSessionStatus(offering.id, date, "Cancelled", "Flooding", secondActor.id),
    ]);

    expect(results.filter((result) => result.changed)).toHaveLength(1);
    expect(results.filter((result) => !result.changed)).toHaveLength(1);
    expect(new Set(results.map((result) => result.session.id)).size).toBe(1);
    expect(new Set(results.map((result) => result.session.recordedAt)).size).toBe(1);
  });

  test("rejects unknown offerings without creating orphan arrival or session rows", async () => {
    const actor = await createUser("unknown-offering");
    const unknownOfferingId = crypto.randomUUID();

    await expect(
      classDeliveryService.saveLecturerArrival(
        unknownOfferingId,
        "2026-08-17",
        "Present",
        "",
        actor.id,
      ),
    ).rejects.toThrow("Offering not found");

    await expect(
      classDeliveryService.saveClassSessionStatus(
        unknownOfferingId,
        "2026-08-17",
        "Holiday",
        "National holiday",
        actor.id,
      ),
    ).rejects.toThrow("Offering not found");

    const arrivalRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."LecturerArrivalConfirmation"
      WHERE "offeringId" = ${unknownOfferingId}
    `;
    const sessionRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."ClassSessionStatus"
      WHERE "offeringId" = ${unknownOfferingId}
    `;
    expect(Number(arrivalRows[0]?.count ?? 0n)).toBe(0);
    expect(Number(sessionRows[0]?.count ?? 0n)).toBe(0);
  });
});
