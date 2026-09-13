import "./attendance-permission-pending-db.test.ts";
import { afterAll, describe, expect, test } from "bun:test";
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { studentsManifest, type StudentsServiceContract } from "@dse-pms/shared-types";
import { registry } from "../../core/plugins/registry.ts";
import {
  AttendanceRecheckConflictError,
  attendanceRecheckService,
} from "./attendance-recheck-service.ts";
import { attendanceService } from "./attendance-service.ts";
import { ReferenceError as OfferingReferenceError } from "./service.ts";

const dbTestsEnabled = process.env.ATTENDANCE_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();
const token = crypto.randomUUID().slice(0, 8);

const studentIds = new Set<string>();
const offeringIds = new Set<string>();
const courseIds = new Set<string>();
const userIds = new Set<string>();

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

async function createActor(label: string) {
  const user = await prisma.user.create({
    data: {
      email: `attendance-actor-${label}-${crypto.randomUUID()}@example.test`,
      name: `Attendance Actor ${label}`,
    },
  });
  userIds.add(user.id);
  return user;
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
  if (userIds.size > 0) await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
  await prisma.$disconnect();
});

describeDb("attendance roster identity", () => {
  test("enriches current roster rows with canonical Khmer name and sex", async () => {
    const offering = await createOffering("identity");
    const student = await createStudent("identity");
    await prisma.studentProfile.create({
      data: {
        studentRecordId: student.id,
        khmerFamilyName: "តាំង",
        khmerGivenName: "កេរីទ្ធ",
        gender: "Male",
      },
    });
    await enroll(offering.id, student.id);

    const attendance = await attendanceService.get(offering.id, "2026-09-13");
    const record = attendance.records.find((item) => item.studentId === student.id);

    expect(record?.studentKhmerName).toBe("តាំង កេរីទ្ធ");
    expect(record?.studentGender).toBe("Male");
    expect(record?.studentName).toBe(student.name);
    expect(record?.studentNumber).toBe(student.studentId);
    expect(record?.checkpoints).toEqual([]);
  });
});

describeDb("two-pass attendance recheck", () => {
  test("captures Check 1 once, records immutable Check 2, and keeps final status explicit", async () => {
    const offering = await createOffering("two-pass");
    const student = await createStudent("two-pass");
    const actor = await createActor("two-pass");
    await enroll(offering.id, student.id);

    const first = await attendanceService.save(
      offering.id,
      "2026-09-13",
      { records: [{ studentId: student.id, status: "Absent", note: "First roll" }] },
      actor.id,
    );
    const firstView = first.records.find((record) => record.studentId === student.id)!;
    expect(firstView.checkpoints).toHaveLength(1);
    expect(firstView.checkpoints?.[0]?.checkNumber).toBe(1);
    expect(firstView.checkpoints?.[0]?.status).toBe("Absent");
    expect(firstView.checkpoints?.[0]?.checkedById).toBe(actor.id);

    const correctedBeforeRecheck = await attendanceService.save(
      offering.id,
      "2026-09-13",
      { records: [{ studentId: student.id, status: "Excused", note: "Final edited before Check 2" }] },
      actor.id,
    );
    const correctedView = correctedBeforeRecheck.records.find((record) => record.studentId === student.id)!;
    expect(correctedView.status).toBe("Excused");
    expect(correctedView.checkpoints).toHaveLength(1);
    expect(correctedView.checkpoints?.[0]?.status).toBe("Absent");
    expect(correctedView.checkpoints?.[0]?.note).toBe("First roll");

    await attendanceRecheckService.recheck(
      offering.id,
      "2026-09-13",
      {
        studentId: student.id,
        observation: { status: "Present", permissionPending: false, note: "Seen in second roll" },
        final: { status: "Late", permissionPending: false, note: "Arrived after first roll" },
      },
      actor.id,
    );

    const rechecked = await attendanceService.get(offering.id, "2026-09-13");
    const recheckedView = rechecked.records.find((record) => record.studentId === student.id)!;
    expect(recheckedView.status).toBe("Late");
    expect(recheckedView.note).toBe("Arrived after first roll");
    expect(recheckedView.checkpoints).toHaveLength(2);
    expect(recheckedView.checkpoints?.map((checkpoint) => checkpoint.status)).toEqual([
      "Absent",
      "Present",
    ]);
    expect(recheckedView.checkpoints?.[1]?.note).toBe("Seen in second roll");

    await expect(
      attendanceRecheckService.recheck(
        offering.id,
        "2026-09-13",
        {
          studentId: student.id,
          observation: { status: "Present", permissionPending: false, note: "Duplicate" },
          final: { status: "Present", permissionPending: false, note: "Duplicate" },
        },
        actor.id,
      ),
    ).rejects.toBeInstanceOf(AttendanceRecheckConflictError);
  });

  test("supports Permission Pending as an auditable Check 1/final state", async () => {
    const offering = await createOffering("pending-recheck");
    const student = await createStudent("pending-recheck");
    const actor = await createActor("pending-recheck");
    await enroll(offering.id, student.id);

    await attendanceService.save(
      offering.id,
      "2026-09-14",
      {
        records: [
          {
            studentId: student.id,
            status: null,
            permissionPending: true,
            note: "Letter to follow",
          },
        ],
      },
      actor.id,
    );

    await attendanceRecheckService.recheck(
      offering.id,
      "2026-09-14",
      {
        studentId: student.id,
        observation: { status: "Present", permissionPending: false, note: "Student is here" },
        final: { status: null, permissionPending: true, note: "Permission still awaiting paper" },
      },
      actor.id,
    );

    const view = await attendanceService.get(offering.id, "2026-09-14");
    const record = view.records.find((row) => row.studentId === student.id)!;
    expect(record.status).toBeNull();
    expect(record.permissionPending).toBe(true);
    expect(record.note).toBe("Permission still awaiting paper");
    expect(record.checkpoints?.[0]?.permissionPending).toBe(true);
    expect(record.checkpoints?.[1]?.status).toBe("Present");
  });

  test("does not manufacture Check 1 for pre-feature attendance sessions", async () => {
    const offering = await createOffering("legacy-session");
    const student = await createStudent("legacy-session");
    const actor = await createActor("legacy-session");
    await enroll(offering.id, student.id);

    const sessionId = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "pms_attendance"."AttendanceSession"
        ("id", "offeringId", "sessionDate", "checkpointTrackingStartedAt")
      VALUES (${sessionId}, ${offering.id}, ${new Date("2026-08-01T00:00:00.000Z")}, NULL)
    `;
    await prisma.$executeRaw`
      INSERT INTO "pms_attendance"."AttendanceRecord"
        ("sessionId", "studentId", "studentNumber", "studentName", "status", "note")
      VALUES (${sessionId}, ${student.id}, ${student.studentId!}, ${student.name}, 'Present', 'Legacy record')
    `;

    const corrected = await attendanceService.save(
      offering.id,
      "2026-08-01",
      { records: [{ studentId: student.id, status: "Late", note: "Historical correction" }] },
      actor.id,
    );
    const record = corrected.records.find((row) => row.studentId === student.id)!;
    expect(record.status).toBe("Late");
    expect(record.checkpoints).toEqual([]);

    await expect(
      attendanceRecheckService.recheck(
        offering.id,
        "2026-08-01",
        {
          studentId: student.id,
          observation: { status: "Present", permissionPending: false, note: "Should fail" },
          final: { status: "Present", permissionPending: false, note: "Should fail" },
        },
        actor.id,
      ),
    ).rejects.toBeInstanceOf(AttendanceRecheckConflictError);
  });
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

    const original = await attendanceService.save(offering.id, "2026-08-18", {
      records: [
        { studentId: current.id, status: "Present", note: "original current" },
        { studentId: former.id, status: "Absent", note: "original former" },
      ],
    });
    expect(original.records.find((record) => record.studentId === former.id)?.checkpoints?.[0]?.status).toBe("Absent");

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
    expect(formerView.studentKhmerName).toBeNull();
    expect(formerView.studentGender).toBeNull();
    expect(formerView.status).toBe("Excused");
    expect(formerView.checkpoints?.[0]?.status).toBe("Absent");
    expect(formerView.checkpoints?.[0]?.studentName).toBeUndefined();

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
