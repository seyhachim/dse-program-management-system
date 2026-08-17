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
      `DELETE FROM "pms_attendance"."LecturerArrivalConfirmation" WHERE "offeringId" = ANY($1::text[])`,
      [...offeringIds],
    );
    await prisma.offering.deleteMany({ where: { id: { in: [...offeringIds] } } });
  }
  if (courseIds.size > 0) await prisma.course.deleteMany({ where: { id: { in: [...courseIds] } } });
  if (userIds.size > 0) await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
  await prisma.$disconnect();
});

describeDb("class delivery lecturer-arrival persistence", () => {
  test("creates one record per offering/date, repeats idempotently, and records state changes", async () => {
    const firstActor = await createUser("first");
    const secondActor = await createUser("second");
    const offering = await createOffering("idempotent");
    const date = "2026-08-17";

    const first = await classDeliveryService.saveLecturerArrival(offering.id, date, "NotYet", firstActor.id);
    expect(first.changed).toBe(true);
    expect(first.confirmation.status).toBe("NotYet");
    expect(first.confirmation.recordedBy.id).toBe(firstActor.id);

    const repeated = await classDeliveryService.saveLecturerArrival(offering.id, date, "NotYet", secondActor.id);
    expect(repeated.changed).toBe(false);
    expect(repeated.confirmation.id).toBe(first.confirmation.id);
    expect(repeated.confirmation.recordedBy.id).toBe(firstActor.id);
    expect(repeated.confirmation.recordedAt).toBe(first.confirmation.recordedAt);

    const changed = await classDeliveryService.saveLecturerArrival(offering.id, date, "Present", secondActor.id);
    expect(changed.changed).toBe(true);
    expect(changed.confirmation.id).toBe(first.confirmation.id);
    expect(changed.confirmation.status).toBe("Present");
    expect(changed.confirmation.recordedBy.id).toBe(secondActor.id);

    const loaded = await classDeliveryService.getLecturerArrival(offering.id, date);
    expect(loaded).toEqual(changed.confirmation);

    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."LecturerArrivalConfirmation"
      WHERE "offeringId" = ${offering.id} AND "date" = ${date}::date
    `;
    expect(Number(rows[0]?.count ?? 0n)).toBe(1);
  });

  test("rejects unknown offerings without creating orphan confirmation rows", async () => {
    const actor = await createUser("unknown-offering");
    const unknownOfferingId = crypto.randomUUID();
    await expect(
      classDeliveryService.saveLecturerArrival(unknownOfferingId, "2026-08-17", "Present", actor.id),
    ).rejects.toThrow("Offering not found");

    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "pms_attendance"."LecturerArrivalConfirmation"
      WHERE "offeringId" = ${unknownOfferingId}
    `;
    expect(Number(rows[0]?.count ?? 0n)).toBe(0);
  });
});
