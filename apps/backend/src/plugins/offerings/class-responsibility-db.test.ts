import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  ClassResponsibilityConflictError,
  ClassResponsibilityEligibilityError,
  classResponsibilityService,
} from "./class-responsibility-service.ts";

const dbTestsEnabled = process.env.CLASS_RESPONSIBILITY_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();
const token = crypto.randomUUID().slice(0, 8);

const userIds = new Set<string>();
const studentIds = new Set<string>();
const offeringIds = new Set<string>();
const courseIds = new Set<string>();

async function createUser(label: string) {
  const user = await prisma.user.create({
    data: { email: `class-resp-${label}-${crypto.randomUUID()}@example.test`, name: `Class Resp ${label}` },
  });
  userIds.add(user.id);
  return user;
}

async function createStudent(label: string, options: { userId?: string; status?: "Active" | "Inactive" } = {}) {
  const student = await prisma.student.create({
    data: {
      email: `class-resp-student-${label}-${crypto.randomUUID()}@example.test`,
      name: `Student ${label}`,
      studentId: `CR-${label}-${crypto.randomUUID().slice(0, 6)}`,
      status: options.status ?? "Active",
      userId: options.userId,
    },
  });
  studentIds.add(student.id);
  return student;
}

async function createOffering(label: string) {
  const course = await prisma.course.create({
    data: {
      code: `CR-${label}-${token}-${crypto.randomUUID().slice(0, 5)}`,
      title: `Class responsibility ${label}`,
      programmeId: "dse",
    },
  });
  courseIds.add(course.id);
  const offering = await prisma.offering.create({
    data: { courseId: course.id, term: `2026-${label}-${token}`, sectionCode: "A", status: "Active" },
  });
  offeringIds.add(offering.id);
  return offering;
}

async function enroll(offeringId: string, studentId: string) {
  await prisma.enrollment.create({ data: { offeringId, studentId } });
}

afterAll(async () => {
  const offerings = [...offeringIds];
  if (offerings.length > 0) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ClassResponsibilityAuditEvent" WHERE "offeringId" = ANY($1::text[])`,
      offerings,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ClassResponsibilityAssignment" WHERE "offeringId" = ANY($1::text[])`,
      offerings,
    );
    await prisma.enrollment.deleteMany({ where: { offeringId: { in: offerings } } });
    await prisma.offering.deleteMany({ where: { id: { in: offerings } } });
  }
  if (courseIds.size > 0) await prisma.course.deleteMany({ where: { id: { in: [...courseIds] } } });
  if (studentIds.size > 0) await prisma.student.deleteMany({ where: { id: { in: [...studentIds] } } });
  if (userIds.size > 0) await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
  await prisma.$disconnect();
});

describeDb("class responsibility PostgreSQL integrity", () => {
  test("assigns enrolled active monitors, replaces holders, and preserves audit history", async () => {
    const actor = await createUser("actor");
    const firstUser = await createUser("first-monitor");
    const secondUser = await createUser("second-monitor");
    const first = await createStudent("first", { userId: firstUser.id });
    const second = await createStudent("second", { userId: secondUser.id });
    const offering = await createOffering("replace");
    await enroll(offering.id, first.id);
    await enroll(offering.id, second.id);

    const original = await classResponsibilityService.assign(offering.id, first.id, "ClassMonitor", actor.id);
    expect(original.student.id).toBe(first.id);
    expect(await classResponsibilityService.getActiveForUser(firstUser.id, offering.id)).not.toBeNull();

    const replacement = await classResponsibilityService.assign(offering.id, second.id, "ClassMonitor", actor.id);
    expect(replacement.student.id).toBe(second.id);
    expect(await classResponsibilityService.getActiveForUser(firstUser.id, offering.id)).toBeNull();
    expect((await classResponsibilityService.list(offering.id)).filter((row) => row.role === "ClassMonitor")).toHaveLength(1);

    const history = await classResponsibilityService.history(offering.id);
    expect(history.map((event) => event.action)).toEqual(["Assigned", "Reassigned", "Assigned"]);
  });

  test("rejects ineligible students and prevents the same student holding both active responsibilities", async () => {
    const actor = await createUser("eligibility-actor");
    const studentUser = await createUser("eligibility-monitor");
    const student = await createStudent("eligible", { userId: studentUser.id });
    const notEnrolled = await createStudent("not-enrolled");
    const inactive = await createStudent("inactive", { status: "Inactive" });
    const offering = await createOffering("eligibility");
    await enroll(offering.id, student.id);
    await enroll(offering.id, inactive.id);

    await expect(
      classResponsibilityService.assign(offering.id, notEnrolled.id, "ClassMonitor", actor.id),
    ).rejects.toBeInstanceOf(ClassResponsibilityEligibilityError);
    await expect(
      classResponsibilityService.assign(offering.id, inactive.id, "ClassMonitor", actor.id),
    ).rejects.toBeInstanceOf(ClassResponsibilityEligibilityError);

    await classResponsibilityService.assign(offering.id, student.id, "ClassMonitor", actor.id);
    await expect(
      classResponsibilityService.assign(offering.id, student.id, "SubClassMonitor", actor.id),
    ).rejects.toBeInstanceOf(ClassResponsibilityConflictError);
  });

  test("revocation and enrollment removal immediately remove runtime authority", async () => {
    const actor = await createUser("revocation-actor");
    const monitorUser = await createUser("revocation-monitor");
    const monitor = await createStudent("revocation", { userId: monitorUser.id });
    const offering = await createOffering("revocation");
    await enroll(offering.id, monitor.id);

    const assignment = await classResponsibilityService.assign(
      offering.id,
      monitor.id,
      "SubClassMonitor",
      actor.id,
    );
    expect(await classResponsibilityService.assertActiveForUser(monitorUser.id, offering.id)).toMatchObject({
      role: "SubClassMonitor",
    });

    expect(await classResponsibilityService.revoke(offering.id, assignment.id, actor.id, "Changed monitor")).toBe(true);
    expect(await classResponsibilityService.getActiveForUser(monitorUser.id, offering.id)).toBeNull();
    expect(await classResponsibilityService.revoke(offering.id, assignment.id, actor.id, "Again")).toBe(false);

    const reassigned = await classResponsibilityService.assign(offering.id, monitor.id, "SubClassMonitor", actor.id);
    expect(reassigned.id).not.toBe(assignment.id);
    await prisma.enrollment.delete({ where: { offeringId_studentId: { offeringId: offering.id, studentId: monitor.id } } });
    expect(await classResponsibilityService.getActiveForUser(monitorUser.id, offering.id)).toBeNull();
  });
});
