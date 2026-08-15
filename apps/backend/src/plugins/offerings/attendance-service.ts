import type {
  AttendanceSessionSummary,
  AttendanceSessionView,
  AttendanceStatus,
  SaveAttendanceInput,
  StudentsServiceContract,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { ReferenceError } from "./service.ts";

const students = () => registry.get<StudentsServiceContract>("students").service;

interface EnrollmentRow {
  studentId: string;
}

interface SessionRow {
  id: string;
  offeringId: string;
  sessionDate: Date;
  updatedAt: Date;
}

interface RecordRow {
  studentId: string;
  studentNumber: string;
  studentName: string;
  status: AttendanceStatus;
  note: string;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateValue(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function emptyCounts() {
  return { Present: 0, Absent: 0, Late: 0, Excused: 0 } satisfies Record<AttendanceStatus, number>;
}

async function roster(offeringId: string): Promise<EnrollmentRow[]> {
  return prisma.$queryRaw<EnrollmentRow[]>`
    SELECT "studentId"
    FROM "Enrollment"
    WHERE "offeringId" = ${offeringId}
  `;
}

async function sessionByDate(offeringId: string, date: string): Promise<SessionRow | null> {
  const rows = await prisma.$queryRaw<SessionRow[]>`
    SELECT "id", "offeringId", "sessionDate", "updatedAt"
    FROM "AttendanceSession"
    WHERE "offeringId" = ${offeringId}
      AND "sessionDate" = ${dateValue(date)}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function getAttendance(offeringId: string, date: string): Promise<AttendanceSessionView> {
  const [enrollments, session] = await Promise.all([roster(offeringId), sessionByDate(offeringId, date)]);
  const currentStudentIds = enrollments.map((row) => row.studentId);
  const studentRows = await students().findByIds(currentStudentIds);
  const studentById = new Map(studentRows.map((student) => [student.id, student]));

  const recordRows = session
    ? await prisma.$queryRaw<RecordRow[]>`
        SELECT "studentId", "studentNumber", "studentName", "status", "note"
        FROM "AttendanceRecord"
        WHERE "sessionId" = ${session.id}
      `
    : [];
  const recordByStudent = new Map(recordRows.map((record) => [record.studentId, record]));

  const counts = { ...emptyCounts(), Unmarked: 0 };
  const records = currentStudentIds
    .map((studentId) => {
      const student = studentById.get(studentId);
      if (!student) return null;
      const attendance = recordByStudent.get(studentId);
      if (attendance) counts[attendance.status] += 1;
      else counts.Unmarked += 1;
      return {
        studentId,
        studentNumber: attendance?.studentNumber ?? student.studentId,
        studentName: attendance?.studentName ?? student.name,
        status: attendance?.status ?? null,
        note: attendance?.note ?? "",
      };
    })
    .filter((record): record is NonNullable<typeof record> => record !== null);

  // A student removed from the current roster remains visible on historical
  // registers using the identity snapshot captured when attendance was saved.
  for (const historical of recordRows) {
    if (currentStudentIds.includes(historical.studentId)) continue;
    counts[historical.status] += 1;
    records.push({
      studentId: historical.studentId,
      studentNumber: historical.studentNumber,
      studentName: historical.studentName,
      status: historical.status,
      note: historical.note,
    });
  }

  records.sort((a, b) => a.studentNumber.localeCompare(b.studentNumber));

  return {
    sessionId: session?.id ?? null,
    offeringId,
    date,
    records,
    counts,
    updatedAt: session?.updatedAt.toISOString() ?? null,
  };
}

export const attendanceService = {
  async list(offeringId: string): Promise<AttendanceSessionSummary[]> {
    const sessions = await prisma.$queryRaw<SessionRow[]>`
      SELECT "id", "offeringId", "sessionDate", "updatedAt"
      FROM "AttendanceSession"
      WHERE "offeringId" = ${offeringId}
      ORDER BY "sessionDate" DESC
    `;
    if (sessions.length === 0) return [];

    const counts = new Map<string, Record<AttendanceStatus, number>>();
    for (const session of sessions) counts.set(session.id, emptyCounts());

    // Use one small query per session. Class attendance history is low-volume,
    // and this avoids driver-specific array parameter casting in raw SQL.
    for (const session of sessions) {
      const rows = await prisma.$queryRaw<Array<{ status: AttendanceStatus; count: bigint }>>`
        SELECT "status", COUNT(*)::bigint AS "count"
        FROM "AttendanceRecord"
        WHERE "sessionId" = ${session.id}
        GROUP BY "status"
      `;
      const sessionCounts = counts.get(session.id)!;
      for (const row of rows) sessionCounts[row.status] = Number(row.count);
    }

    return sessions.map((session) => ({
      sessionId: session.id,
      offeringId: session.offeringId,
      date: dateOnly(session.sessionDate),
      counts: counts.get(session.id) ?? emptyCounts(),
      updatedAt: session.updatedAt.toISOString(),
    }));
  },

  get: getAttendance,

  async save(offeringId: string, date: string, input: SaveAttendanceInput): Promise<AttendanceSessionView> {
    const enrollments = await roster(offeringId);
    const currentStudentIds = new Set(enrollments.map((row) => row.studentId));
    for (const record of input.records) {
      if (!currentStudentIds.has(record.studentId)) {
        throw new ReferenceError("Attendance can only be recorded for students enrolled in this class section");
      }
    }

    const studentRows = await students().findByIds(input.records.map((record) => record.studentId));
    const studentById = new Map(studentRows.map((student) => [student.id, student]));
    if (studentRows.length !== input.records.length) {
      throw new ReferenceError("One or more attendance students no longer exist");
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRaw<SessionRow[]>`
        SELECT "id", "offeringId", "sessionDate", "updatedAt"
        FROM "AttendanceSession"
        WHERE "offeringId" = ${offeringId}
          AND "sessionDate" = ${dateValue(date)}
        LIMIT 1
      `;
      const sessionId = existing[0]?.id ?? crypto.randomUUID();

      if (existing.length === 0) {
        await tx.$executeRaw`
          INSERT INTO "AttendanceSession" ("id", "offeringId", "sessionDate")
          VALUES (${sessionId}, ${offeringId}, ${dateValue(date)})
        `;
      } else {
        await tx.$executeRaw`
          UPDATE "AttendanceSession"
          SET "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${sessionId}
        `;
      }

      await tx.$executeRaw`
        DELETE FROM "AttendanceRecord"
        WHERE "sessionId" = ${sessionId}
      `;

      for (const record of input.records) {
        const student = studentById.get(record.studentId)!;
        await tx.$executeRaw`
          INSERT INTO "AttendanceRecord"
            ("sessionId", "studentId", "studentNumber", "studentName", "status", "note")
          VALUES
            (${sessionId}, ${record.studentId}, ${student.studentId}, ${student.name}, ${record.status}, ${record.note})
        `;
      }
    });

    return getAttendance(offeringId, date);
  },
};
