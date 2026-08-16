import { afterAll, describe, expect, test } from "bun:test";
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { studentsManifest, type StudentsServiceContract } from "@dse-pms/shared-types";
import { registry } from "../../core/plugins/registry.ts";
import { attendanceService } from "./attendance-service.ts";
import { ReferenceError as OfferingReferenceError } from "./service.ts";

const dbTestsEnabled = process.env.ATTENDANCE_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();
const token = crypto.randomUUID().slice(0, 8);

const studentIds = new Set<string>();
const offeringIds = new Set<string>();
const courseIds = new Set<string>();

if (!registry.has("students")) {
  const service: StudentsServiceContract = {
    async getById(id) {
      return prisma.student.findUnique({ where: { id } });
    },
    async findByIds(ids) {
      return prisma.student.findMany({ where: { id: { in: ids } } });
    },
  };
  registry.register({ manifest: studentsManifest, router: Router(), service });
}

async function createStudent(label: string) {
  const student = await prisma.student.create({
    data: {
      name: `Attendance ${label}`,
      email: `attendance-${label}-${crypto.randomUUID()}@example.test`,
      studentId: `AT-${label}-${crypto.randomUUID().slice(0, 6)}`,
      status: "Active",
    },
  });
  studentIds.add(student.id);
  return student;
}

async function createOffering(label: string) {
  const course = await prisma.course.create({
    data: {
      code: `AT-${label}-${token}-${crypto.randomUUID().slice(0, 5)}`,
      title: `Attendance ${label}`,
      programmeId: "dse",
    },
  });
  courseIds.add(course.id);
  const offering = await prisma.offering.create({
    data: {
      courseId: course.id,
      term: `2026-${label}-${token}`,
      sectionCode: "A",
      status: "Active",
    },
  });
  offeringIds.add(offering.id);
  return offering;
}

async function enroll(offeringId: string, studentId: string) {
  await prisma.enrollment.create({ data: { offeringId, studentId } });
}

async function storedRecords(offeringId: string, date: string) {
  return prisma.$queryRaw<
    Array<{
      studentId: string;
      studentNumber: string;
      studentName: string;
      status: string;
      note: string;
    }>
  >`
    SELECT r."studentId", r."studentNumber", r."studentName", r."status", r."note"
    FROM "pms_attendance"."AttendanceRecord" r
    JOIN "pms_attendance"."AttendanceSession" s ON s."id" = r."sessionId"
    WHERE s."offeringId" = ${offeringId}
      AND s."sessionDate" = ${new Date(`${date}T00:00:00.000Z`)}
    ORDER BY r."studentId"
  `;
}

afterAll(async () => {
  const offerings = [...offeringIds];
  if (offerings.length > 0) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "pms_attendance"."AttendanceSession" WHERE "offeringId" = ANY($1::text[])`,
      offerings,
    );
    await prisma.enrollment.deleteMany({ where: { offeringId: { in: offerings } } });
    await prisma.offering.deleteMany({ where: { id: { in: offerings } } });
  }
  if (courseIds.size > 0) await prisma.course.deleteMany({ where: { id: { in: [...courseIds] } } });
  if (studentIds.size > 0) await prisma.student.deleteMany({ where: { id: { in: [...studentIds] } } });
  await prisma.$disconnect();
});

describeDb("historical attendance correction", () => {
  test("new registers reject students outside the current offering roster", async () => {
    const offering = await createOffering("new-register");
    const otherOffering = await createOffering("other-section");
    const current = await createStudent("current");
    const neverEnrolled = await createStudent("never-enrolled");
    const crossOffering = await createStudent("cross-offering");
    await enroll(offering.id, current.id);
    await enroll(otherOffering.id, crossOffering.id);

    await expect(
      attendanceService.save(offering.id, "2026-08-17", {
        records: [
          { studentId: current.id, status: "Present", note: "" },
          { studentId: neverEnrolled.id, status: "Absent", note: "" },
        ],
      }),
    ).rejects.toBeInstanceOf(OfferingReferenceError);

    await expect(
      attendanceService.save(offering.id, "2026-08-17", {
        records: [{ studentId: crossOffering.id, status: "Present", note: "" }],
      }),
    ).rejects.toBeInstanceOf(OfferingReferenceError);

    const sessions = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS "count"
      FROM "pms_attendance"."AttendanceSession"
      WHERE "offeringId" = ${offering.id}
        AND "sessionDate" = ${new Date("2026-08-17T00:00:00.000Z")}
    `;
    expect(Number(sessions[0]?.count ?? 0n)).toBe(0);
  });

  test("existing registers accept exact-session historical students and preserve snapshot identity", async () => {
    const offering = await createOffering("historical");
    const current = await createStudent("historical-current");
    const former = await createStudent("historical-former");
    await enroll(offering.id, current.id);
    await enroll(offering.id, former.id);

    const originalCurrentNumber = current.studentId;
    const originalFormerNumber = former.studentId;
    const originalFormerName = former.name;

    await attendanceService.save(offering.id, "2026-08-18", {
      records: [
        { studentId: current.id, status: "Present", note: "original current" },
        { studentId: former.id, status: "Absent", note: "original former" },
      ],
    });

    const currentAfterEdit = await prisma.student.update({
      where: { id: current.id },
      data: {
        name: `${current.name} Updated`,
        studentId: `${current.studentId}-NEW`,
      },
    });
    await prisma.student.update({
      where: { id: former.id },
      data: {
        name: `${former.name} Changed Later`,
        studentId: `${former.studentId}-NEW`,
      },
    });
    await prisma.enrollment.delete({
      where: { offeringId_studentId: { offeringId: offering.id, studentId: former.id } },
    });

    const corrected = await attendanceService.save(offering.id, "2026-08-18", {
      records: [
        { studentId: current.id, status: "Late", note: "corrected current" },
        { studentId: former.id, status: "Excused", note: "corrected former" },
      ],
    });

    const currentView = corrected.records.find((record) => record.studentId === current.id)!;
    const formerView = corrected.records.find((record) => record.studentId === former.id)!;
    expect(currentView.studentNumber).toBe(currentAfterEdit.studentId);
    expect(currentView.studentName).toBe(currentAfterEdit.name);
    expect(currentView.studentNumber).not.toBe(originalCurrentNumber);
    expect(formerView.studentNumber).toBe(originalFormerNumber);
    expect(formerView.studentName).toBe(originalFormerName);
    expect(formerView.status).toBe("Excused");

    await expect(
      attendanceService.save(offering.id, "2026-08-19", {
        records: [{ studentId: former.id, status: "Present", note: "wrong date" }],
      }),
    ).rejects.toBeInstanceOf(OfferingReferenceError);
  });

  test("invalid historical corrections fail before replacing any saved records", async () => {
    const offering = await createOffering("atomic");
    const otherOffering = await createOffering("atomic-other");
    const current = await createStudent("atomic-current");
    const former = await createStudent("atomic-former");
    const arbitrary = await createStudent("atomic-arbitrary");
    const crossOffering = await createStudent("atomic-cross");
    await enroll(offering.id, current.id);
    await enroll(offering.id, former.id);
    await enroll(otherOffering.id, crossOffering.id);

    await attendanceService.save(offering.id, "2026-08-20", {
      records: [
        { studentId: current.id, status: "Present", note: "keep current" },
        { studentId: former.id, status: "Absent", note: "keep former" },
      ],
    });
    await prisma.enrollment.delete({
      where: { offeringId_studentId: { offeringId: offering.id, studentId: former.id } },
    });

    const before = await storedRecords(offering.id, "2026-08-20");

    await expect(
      attendanceService.save(offering.id, "2026-08-20", {
        records: [
          { studentId: current.id, status: "Absent", note: "must roll back" },
          { studentId: former.id, status: "Present", note: "must roll back" },
          { studentId: arbitrary.id, status: "Late", note: "invalid" },
        ],
      }),
    ).rejects.toBeInstanceOf(OfferingReferenceError);
    expect(await storedRecords(offering.id, "2026-08-20")).toEqual(before);

    await expect(
      attendanceService.save(offering.id, "2026-08-20", {
        records: [
          { studentId: current.id, status: "Late", note: "must still roll back" },
          { studentId: crossOffering.id, status: "Present", note: "wrong offering" },
        ],
      }),
    ).rejects.toBeInstanceOf(OfferingReferenceError);
    expect(await storedRecords(offering.id, "2026-08-20")).toEqual(before);
  });
});
