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
    FROM "pms_attendance"."AttendanceSession"
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
        FROM "pms_attendance"."AttendanceRecord"
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
      FROM "pms_attendance"."AttendanceSession"
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
        FROM "pms_attendance"."AttendanceRecord"
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
    // Current roster rows use the canonical Students service identity. Historical-only
    // rows deliberately do not depend on the current Student record; their exact saved
    // identity snapshot is resolved inside the transaction below.
    const requestedStudentIds = [...new Set(input.records.map((record) => record.studentId))];
    const studentRows = await students().findByIds(requestedStudentIds);
    const studentById = new Map(studentRows.map((student) => [student.id, student]));

    await prisma.$transaction(async (tx) => {
      // Lock current Enrollment rows for the duration of replacement so a concurrent
      // unenrollment cannot invalidate roster eligibility after validation succeeds.
      const enrollments = await tx.$queryRaw<EnrollmentRow[]>`
        SELECT "studentId"
        FROM "Enrollment"
        WHERE "offeringId" = ${offeringId}
        FOR SHARE
      `;
      const currentStudentIds = new Set(enrollments.map((row) => row.studentId));

      // Lock the exact historical session while correcting it. Eligibility for a
      // historical-only student is scoped to records already stored in this session,
      // never to another date or another offering.
      const existing = await tx.$queryRaw<SessionRow[]>`
        SELECT "id", "offeringId", "sessionDate", "updatedAt"
        FROM "pms_attendance"."AttendanceSession"
        WHERE "offeringId" = ${offeringId}
          AND "sessionDate" = ${dateValue(date)}
        LIMIT 1
        FOR UPDATE
      `;
      const existingSession = existing[0] ?? null;
      const historicalRows = existingSession
        ? await tx.$queryRaw<RecordRow[]>`
            SELECT "studentId", "studentNumber", "studentName", "status", "note"
            FROM "pms_attendance"."AttendanceRecord"
            WHERE "sessionId" = ${existingSession.id}
          `
        : [];
      const historicalByStudent = new Map(historicalRows.map((record) => [record.studentId, record]));

      // Validate the complete replacement before mutating anything. New registers stay
      // current-roster-only; existing registers additionally accept only students that
      // already belong to this exact saved session.
      for (const record of input.records) {
        const isCurrent = currentStudentIds.has(record.studentId);
        const historical = historicalByStudent.get(record.studentId);
        if (!isCurrent && !historical) {
          throw new ReferenceError(
            "Attendance can only be recorded for current students or students already present in this saved register",
          );
        }
        if (isCurrent && !studentById.has(record.studentId)) {
          throw new ReferenceError("One or more attendance students no longer exist");
        }
      }

      const sessionId = existingSession?.id ?? crypto.randomUUID();
      if (!existingSession) {
        await tx.$executeRaw`
          INSERT INTO "pms_attendance"."AttendanceSession" ("id", "offeringId", "sessionDate")
          VALUES (${sessionId}, ${offeringId}, ${dateValue(date)})
        `;
      } else {
        await tx.$executeRaw`
          UPDATE "pms_attendance"."AttendanceSession"
          SET "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${sessionId}
        `;
      }

      await tx.$executeRaw`
        DELETE FROM "pms_attendance"."AttendanceRecord"
        WHERE "sessionId" = ${sessionId}
      `;

      for (const record of input.records) {
        const currentStudent = currentStudentIds.has(record.studentId)
          ? studentById.get(record.studentId)
          : null;
        const historical = historicalByStudent.get(record.studentId);
        const studentNumber = currentStudent?.studentId ?? historical!.studentNumber;
        const studentName = currentStudent?.name ?? historical!.studentName;

        await tx.$executeRaw`
          INSERT INTO "pms_attendance"."AttendanceRecord"
            ("sessionId", "studentId", "studentNumber", "studentName", "status", "note")
          VALUES
            (${sessionId}, ${record.studentId}, ${studentNumber}, ${studentName}, ${record.status}, ${record.note})
        `;
      }
    });

    return getAttendance(offeringId, date);
  },
};
