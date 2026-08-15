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
  id: string;
  studentId: string;
}

interface SessionRow {
  id: string;
  offeringId: string;
  sessionDate: Date;
  updatedAt: Date;
}

interface RecordRow {
  enrollmentId: string;
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
    SELECT "id", "studentId"
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

export const attendanceService = {
  async list(offeringId: string): Promise<AttendanceSessionSummary[]> {
    const sessions = await prisma.$queryRaw<SessionRow[]>`
      SELECT "id", "offeringId", "sessionDate", "updatedAt"
      FROM "AttendanceSession"
      WHERE "offeringId" = ${offeringId}
      ORDER BY "sessionDate" DESC
    `;
    if (sessions.length === 0) return [];

    const ids = sessions.map((session) => session.id);
    const records = await prisma.$queryRaw<Array<{ sessionId: string; status: AttendanceStatus }>>`
      SELECT "sessionId", "status"
      FROM "AttendanceRecord"
      WHERE "sessionId" = ANY(${ids}::text[])
    `;

    const counts = new Map<string, Record<AttendanceStatus, number>>();
    for (const session of sessions) counts.set(session.id, emptyCounts());
    for (const record of records) {
      const sessionCounts = counts.get(record.sessionId);
      if (sessionCounts) sessionCounts[record.status] += 1;
    }

    return sessions.map((session) => ({
      sessionId: session.id,
      offeringId: session.offeringId,
      date: dateOnly(session.sessionDate),
      counts: counts.get(session.id) ?? emptyCounts(),
      updatedAt: session.updatedAt.toISOString(),
    }));
  },

  async get(offeringId: string, date: string): Promise<AttendanceSessionView> {
    const [enrollments, session] = await Promise.all([roster(offeringId), sessionByDate(offeringId, date)]);
    const studentRows = await students().findByIds(enrollments.map((row) => row.studentId));
    const studentById = new Map(studentRows.map((student) => [student.id, student]));

    const recordRows = session
      ? await prisma.$queryRaw<RecordRow[]>`
          SELECT "enrollmentId", "status", "note"
          FROM "AttendanceRecord"
          WHERE "sessionId" = ${session.id}
        `
      : [];
    const recordByEnrollment = new Map(recordRows.map((record) => [record.enrollmentId, record]));

    const counts = { ...emptyCounts(), Unmarked: 0 };
    const records = enrollments
      .map((enrollment) => {
        const student = studentById.get(enrollment.studentId);
        if (!student) return null;
        const attendance = recordByEnrollment.get(enrollment.id);
        if (attendance) counts[attendance.status] += 1;
        else counts.Unmarked += 1;
        return {
          studentId: student.id,
          studentNumber: student.studentId,
          studentName: student.name,
          status: attendance?.status ?? null,
          note: attendance?.note ?? "",
        };
      })
      .filter((record): record is NonNullable<typeof record> => record !== null)
      .sort((a, b) => a.studentNumber.localeCompare(b.studentNumber));

    return {
      sessionId: session?.id ?? null,
      offeringId,
      date,
      records,
      counts,
      updatedAt: session?.updatedAt.toISOString() ?? null,
    };
  },

  async save(offeringId: string, date: string, input: SaveAttendanceInput): Promise<AttendanceSessionView> {
    const enrollments = await roster(offeringId);
    const enrollmentByStudent = new Map(enrollments.map((row) => [row.studentId, row.id]));
    for (const record of input.records) {
      if (!enrollmentByStudent.has(record.studentId)) {
        throw new ReferenceError("Attendance can only be recorded for students enrolled in this class section");
      }
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
        const enrollmentId = enrollmentByStudent.get(record.studentId)!;
        await tx.$executeRaw`
          INSERT INTO "AttendanceRecord" ("sessionId", "enrollmentId", "status", "note")
          VALUES (${sessionId}, ${enrollmentId}, ${record.status}, ${record.note})
        `;
      }
    });

    return this.get(offeringId, date);
  },
};
