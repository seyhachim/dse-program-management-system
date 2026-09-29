import { afterAll, describe, expect, test } from "bun:test";
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { studentsManifest, type StudentsServiceContract } from "@dse-pms/shared-types";
import { registry } from "../../core/plugins/registry.ts";
import { attendanceRecheckService } from "./attendance-recheck-service.ts";
import { attendanceService } from "./attendance-service.ts";
import { studentAttendanceHistoryService } from "./student-attendance-history-service.ts";

const dbTestsEnabled = process.env.ATTENDANCE_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();
const token = crypto.randomUUID().slice(0, 8);

if (!registry.has("students")) {
  const service: StudentsServiceContract = {
    async getById(id) {
      return prisma.student.findUnique({ where: { id } });
    },
    async findByIds(ids) {
      const rows = await prisma.student.findMany({
        where: { id: { in: ids } },
        include: { profile: true },
      });
      return rows.map((row) => ({
        ...row,
        profile: row.profile
          ? {
              ...row.profile,
              createdAt: row.profile.createdAt.toISOString(),
              updatedAt: row.profile.updatedAt.toISOString(),
            }
          : null,
      }));
    },
  };
  registry.register({ manifest: studentsManifest, router: Router(), service });
}

let offeringId: string | null = null;
let courseId: string | null = null;
let studentId: string | null = null;
let actorId: string | null = null;

afterAll(async () => {
  if (offeringId) {
    await prisma.$executeRaw`DELETE FROM "pms_attendance"."AttendanceSession" WHERE "offeringId" = ${offeringId}`;
    await prisma.enrollment.deleteMany({ where: { offeringId } });
    await prisma.offering.deleteMany({ where: { id: offeringId } });
  }
  if (courseId) await prisma.course.deleteMany({ where: { id: courseId } });
  if (studentId) await prisma.student.deleteMany({ where: { id: studentId } });
  if (actorId) await prisma.user.deleteMany({ where: { id: actorId } });
  await prisma.$disconnect();
});

describeDb("attendance for students with pending official IDs", () => {
  test("saves roll call, permission pending, and Check 2 without inventing an official ID", async () => {
    const course = await prisma.course.create({
      data: {
        code: `AT-PROV-${token}`,
        title: "Attendance provisional student test",
        programmeId: "dse",
      },
    });
    courseId = course.id;

    const offering = await prisma.offering.create({
      data: {
        courseId: course.id,
        term: `2026-PROV-${token}`,
        sectionCode: "M1",
        status: "Active",
      },
    });
    offeringId = offering.id;

    const student = await prisma.student.create({
      data: {
        name: "Provisional Attendance Student",
        email: `attendance-provisional-${token}@rupp.edu.kh`,
        studentId: null,
        status: "Active",
      },
    });
    studentId = student.id;

    const actor = await prisma.user.create({
      data: {
        email: `attendance-provisional-actor-${token}@example.test`,
        name: "Attendance Provisional Actor",
      },
    });
    actorId = actor.id;

    await prisma.enrollment.create({
      data: { offeringId: offering.id, studentId: student.id },
    });

    const first = await attendanceService.save(
      offering.id,
      "2026-09-14",
      { records: [{ studentId: student.id, status: "Present", note: "Initial roll" }] },
      actor.id,
    );
    const firstRecord = first.records.find((record) => record.studentId === student.id);
    expect(firstRecord?.status).toBe("Present");
    expect(firstRecord?.studentNumber).toBeNull();
    expect(firstRecord?.checkpoints?.[0]?.status).toBe("Present");

    const storedInitial = await prisma.$queryRaw<Array<{
      recordNumber: string | null;
      checkpointNumber: string | null;
    }>>`
      SELECT record."studentNumber" AS "recordNumber",
             checkpoint."studentNumber" AS "checkpointNumber"
      FROM "pms_attendance"."AttendanceSession" session
      JOIN "pms_attendance"."AttendanceRecord" record
        ON record."sessionId" = session."id" AND record."studentId" = ${student.id}
      JOIN "pms_attendance"."AttendanceCheckpoint" checkpoint
        ON checkpoint."sessionId" = session."id"
       AND checkpoint."studentId" = ${student.id}
       AND checkpoint."checkNumber" = 1
      WHERE session."offeringId" = ${offering.id}
        AND session."sessionDate" = ${new Date("2026-09-14T00:00:00.000Z")}
    `;
    expect(storedInitial[0]).toEqual({ recordNumber: null, checkpointNumber: null });

    await attendanceRecheckService.recheck(
      offering.id,
      "2026-09-14",
      {
        studentId: student.id,
        observation: {
          status: "Present",
          permissionPending: false,
          note: "Seen at Check 2",
        },
        final: {
          status: "Late",
          permissionPending: false,
          note: "Finalized after Check 2",
        },
      },
      actor.id,
    );

    const afterRecheck = await attendanceService.get(offering.id, "2026-09-14");
    const rechecked = afterRecheck.records.find((record) => record.studentId === student.id);
    expect(rechecked?.status).toBe("Late");
    expect(rechecked?.studentNumber).toBeNull();
    expect(rechecked?.checkpoints).toHaveLength(2);

    const checkpointNumbers = await prisma.$queryRaw<Array<{
      checkNumber: number;
      studentNumber: string | null;
    }>>`
      SELECT checkpoint."checkNumber", checkpoint."studentNumber"
      FROM "pms_attendance"."AttendanceCheckpoint" checkpoint
      JOIN "pms_attendance"."AttendanceSession" session ON session."id" = checkpoint."sessionId"
      WHERE session."offeringId" = ${offering.id}
        AND session."sessionDate" = ${new Date("2026-09-14T00:00:00.000Z")}
        AND checkpoint."studentId" = ${student.id}
      ORDER BY checkpoint."checkNumber"
    `;
    expect(checkpointNumbers).toEqual([
      { checkNumber: 1, studentNumber: null },
      { checkNumber: 2, studentNumber: null },
    ]);

    const pending = await attendanceService.save(
      offering.id,
      "2026-09-15",
      {
        records: [
          {
            studentId: student.id,
            status: null,
            permissionPending: true,
            note: "Paper permission to follow",
          },
        ],
      },
      actor.id,
    );
    const pendingRecord = pending.records.find((record) => record.studentId === student.id);
    expect(pendingRecord?.permissionPending).toBe(true);
    expect(pendingRecord?.studentNumber).toBeNull();

    const storedPending = await prisma.$queryRaw<Array<{ studentNumber: string | null }>>`
      SELECT pending."studentNumber"
      FROM "pms_attendance"."AttendancePermissionPending" pending
      JOIN "pms_attendance"."AttendanceSession" session ON session."id" = pending."sessionId"
      WHERE session."offeringId" = ${offering.id}
        AND session."sessionDate" = ${new Date("2026-09-15T00:00:00.000Z")}
        AND pending."studentId" = ${student.id}
        AND pending."resolvedAt" IS NULL
    `;
    expect(storedPending[0]?.studentNumber).toBeNull();

    await attendanceService.save(
      offering.id,
      "2026-09-16",
      { records: [{ studentId: student.id, status: "Late", note: "Late check 2" }] },
      actor.id,
    );
    await attendanceService.save(
      offering.id,
      "2026-09-17",
      { records: [{ studentId: student.id, status: "Late", note: "Late check 3" }] },
      actor.id,
    );

    const individualHealth = await studentAttendanceHistoryService.healthForStudent(
      student.id,
      offering.id,
    );
    expect(individualHealth).not.toBeNull();
    expect(individualHealth?.history.studentNumber).toBeNull();
    expect(individualHealth?.history.counts.Late).toBe(3);
    expect(individualHealth?.warningCandidates).toContainEqual(
      expect.objectContaining({ kind: "punctuality", count: 3 }),
    );

    const warningHealth = await studentAttendanceHistoryService.warningHealthForStudents(
      [student.id],
      offering.id,
    );
    expect(warningHealth.get(student.id)?.counts.Late).toBe(3);
    expect(warningHealth.get(student.id)?.warningCandidates).toContainEqual(
      expect.objectContaining({ kind: "punctuality", count: 3 }),
    );
  });
});
