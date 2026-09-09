import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../core/db/prisma.ts";
import { telegramNotificationService } from "../plugins/telegram/notification-service.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;

integrationDescribe("Teaching leave operational Telegram recipients", () => {
  let offeringId = "";
  let linkedIdentityId = "";
  const original = {
    JWT_SECRET: process.env.JWT_SECRET,
    TELEGRAM_MINI_APP_URL: process.env.TELEGRAM_MINI_APP_URL,
    TELEGRAM_PMS_ENABLED: process.env.TELEGRAM_PMS_ENABLED,
    TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED,
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "teaching-leave-integration-secret";
    process.env.TELEGRAM_MINI_APP_URL = "https://example.com/telegram";
    process.env.TELEGRAM_PMS_ENABLED = "false";
    process.env.TELEGRAM_ENABLED = "false";

    const lecturer = await prisma.user.findUniqueOrThrow({ where: { email: "lecturer@dse.dev" } });
    const course = await prisma.course.create({
      data: {
        code: `LEAVE-NOTIFY-${randomUUID().slice(0, 8)}`,
        title: "Teaching Leave Notification Fixture",
        programmeId: "dse",
      },
    });
    const offering = await prisma.offering.create({
      data: {
        courseId: course.id,
        lecturerId: lecturer.id,
        term: `2099-N-${randomUUID().slice(0, 6)}`,
        sectionCode: "A",
        status: "Active",
      },
    });
    offeringId = offering.id;

    const linkedUser = await prisma.user.create({
      data: { email: `leave-linked-${randomUUID()}@example.test`, name: "Leave Linked Student" },
    });
    const unlinkedUser = await prisma.user.create({
      data: { email: `leave-unlinked-${randomUUID()}@example.test`, name: "Leave Unlinked Student" },
    });
    const [linkedStudent, unlinkedStudent] = await Promise.all([
      prisma.student.create({ data: { name: "Leave Linked Student", studentId: `TL-${randomUUID()}`, userId: linkedUser.id } }),
      prisma.student.create({ data: { name: "Leave Unlinked Student", studentId: `TU-${randomUUID()}`, userId: unlinkedUser.id } }),
    ]);
    await prisma.enrollment.createMany({
      data: [
        { offeringId, studentId: linkedStudent.id },
        { offeringId, studentId: unlinkedStudent.id },
      ],
    });

    linkedIdentityId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "telegram_security"."TelegramIdentity"
        ("id","userId","telegramUserId","linkedAt","lastVerifiedAt","updatedAt")
      VALUES (${linkedIdentityId},${linkedUser.id},${`9${Date.now()}`},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `;
    await prisma.$executeRaw`
      INSERT INTO "telegram_security"."TelegramNotificationPreference"
        ("identityId","announcementsEnabled","updatedAt")
      VALUES (${linkedIdentityId},FALSE,CURRENT_TIMESTAMP)
      ON CONFLICT ("identityId") DO UPDATE
      SET "announcementsEnabled"=FALSE,"updatedAt"=CURRENT_TIMESTAMP
    `;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("schedule changes ignore announcement opt-out and count unlinked enrollments as missing", async () => {
    const requestId = randomUUID();
    const occurrenceId = randomUUID();
    const result = await telegramNotificationService.deliverTeachingLeaveStudents({
      requestId,
      occurrenceId,
      offeringId,
      programmeId: "dse",
      courseCode: "TEST",
      courseTitle: "Operational Schedule Test",
      sectionCode: "A",
      sessionDate: "2099-01-05",
      startTime: "08:00",
      endTime: "10:00",
      room: "R1",
      releaseForReuse: false,
      proposedHandling: "MAKE_UP",
    });

    // The linked student opted out of optional course announcements, but this
    // operational schedule change is still attempted. Delivery is expected to
    // fail because the PMS bot is disabled in this integration test.
    expect(result.failed).toBe(1);
    expect(result.missing).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.duplicate).toBe(0);

    const deliveries = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "telegram_security"."TelegramNotificationDelivery"
      WHERE "identityId"=${linkedIdentityId}
        AND "eventKey"=${`teaching-leave:${requestId}:${occurrenceId}:students`}
        AND "kind"='teaching_leave_student'
    `;
    expect(Number(deliveries[0]?.count ?? 0n)).toBe(1);
  });
});
