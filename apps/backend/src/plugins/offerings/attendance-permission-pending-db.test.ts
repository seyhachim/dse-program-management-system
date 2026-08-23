import { afterAll, describe, expect, test } from "bun:test";
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { studentsManifest, type StudentsServiceContract } from "@dse-pms/shared-types";
import { registry } from "../../core/plugins/registry.ts";
import { attendanceService } from "./attendance-service.ts";

const enabled = process.env.ATTENDANCE_DB_TESTS === "1";
const describeDb = enabled ? describe : describe.skip;
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
      name: `Pending ${label}`,
      email: `pending-${label}-${crypto.randomUUID()}@example.test`,
      studentId: `PP-${label}-${crypto.randomUUID().slice(0, 6)}`,
      status: "Active",
    },
  });
  studentIds.add(student.id);
  return student;
}

async function createOffering(label: string) {
  const course = await prisma.course.create({
    data: {
      code: `PP-${label}-${token}-${crypto.randomUUID().slice(0, 5)}`,
      title: `Permission Pending ${label}`,
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

afterAll(async () => {
  if (offeringIds.size > 0) {
    const ids = [...offeringIds];
    await prisma.$executeRawUnsafe(
      `DELETE FROM "pms_attendance"."AttendanceSession" WHERE "offeringId" = ANY($1::text[])`,
      ids,
    );
    await prisma.enrollment.deleteMany({ where: { offeringId: { in: ids } } });
    await prisma.offering.deleteMany({ where: { id: { in: ids } } });
  }
  if (courseIds.size > 0) await prisma.course.deleteMany({ where: { id: { in: [...courseIds] } } });
  if (studentIds.size > 0) await prisma.student.deleteMany({ where: { id: { in: [...studentIds] } } });
  await prisma.$disconnect();
});

describeDb("attendance Permission Pending", () => {
  test("keeps pending separate from finalized attendance and resolves only by explicit save", async () => {
    const offering = await createOffering("resolve");
    const student = await createStudent("resolve");
    await enroll(offering.id, student.id);

    const pending = await attendanceService.save(offering.id, "2026-08-23", {
      records: [{ studentId: student.id, status: null, permissionPending: true, note: "Paper letter to follow" }],
    });
    const pendingView = pending.records.find((row) => row.studentId === student.id)!;
    expect(pendingView.status).toBeNull();
    expect(pendingView.permissionPending).toBe(true);
    expect(pending.counts.PermissionPending).toBe(1);
    expect(pending.counts.Absent).toBe(0);
    expect(pending.counts.Excused).toBe(0);

    const finalizedRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS "count"
      FROM "pms_attendance"."AttendanceRecord" r
      JOIN "pms_attendance"."AttendanceSession" s ON s."id" = r."sessionId"
      WHERE s."offeringId" = ${offering.id}
        AND s."sessionDate" = ${new Date("2026-08-23T00:00:00.000Z")}
        AND r."studentId" = ${student.id}
    `;
    expect(Number(finalizedRows[0]?.count ?? 0n)).toBe(0);

    const reopened = await attendanceService.get(offering.id, "2026-08-23");
    expect(reopened.records.find((row) => row.studentId === student.id)?.permissionPending).toBe(true);

    const resolved = await attendanceService.save(offering.id, "2026-08-23", {
      records: [{ studentId: student.id, status: "Excused", permissionPending: false, note: "Paper checked" }],
    });
    expect(resolved.records.find((row) => row.studentId === student.id)?.status).toBe("Excused");
    expect(resolved.records.find((row) => row.studentId === student.id)?.permissionPending).toBe(false);

    const workflow = await prisma.$queryRaw<Array<{ resolution: string | null; resolvedAt: Date | null }>>`
      SELECT p."resolution", p."resolvedAt"
      FROM "pms_attendance"."AttendancePermissionPending" p
      JOIN "pms_attendance"."AttendanceSession" s ON s."id" = p."sessionId"
      WHERE s."offeringId" = ${offering.id}
        AND s."sessionDate" = ${new Date("2026-08-23T00:00:00.000Z")}
        AND p."studentId" = ${student.id}
      ORDER BY p."createdAt" DESC
      LIMIT 1
    `;
    expect(workflow[0]?.resolution).toBe("Excused");
    expect(workflow[0]?.resolvedAt).toBeInstanceOf(Date);
  });

  test("historical student with pending permission remains resolvable in the exact saved session", async () => {
    const offering = await createOffering("historical");
    const student = await createStudent("historical");
    await enroll(offering.id, student.id);

    await attendanceService.save(offering.id, "2026-08-24", {
      records: [{ studentId: student.id, status: null, permissionPending: true, note: "Pending" }],
    });
    await prisma.enrollment.delete({
      where: { offeringId_studentId: { offeringId: offering.id, studentId: student.id } },
    });

    const reopened = await attendanceService.get(offering.id, "2026-08-24");
    expect(reopened.records.find((row) => row.studentId === student.id)?.permissionPending).toBe(true);

    const resolved = await attendanceService.save(offering.id, "2026-08-24", {
      records: [{ studentId: student.id, status: "Absent", permissionPending: false, note: "Not approved" }],
    });
    expect(resolved.records.find((row) => row.studentId === student.id)?.status).toBe("Absent");

    await expect(attendanceService.save(offering.id, "2026-08-25", {
      records: [{ studentId: student.id, status: "Absent", permissionPending: false, note: "Wrong date" }],
    })).rejects.toThrow();
  });
});
