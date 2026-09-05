import { Prisma } from "@prisma/client";
import type { AttendanceStatus, TelegramStudentAttendanceHistory } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { evaluateAttendanceHealth, type AttendanceHealthRecord } from "./attendance-health.ts";
import { ReferenceError } from "./service.ts";

type SessionRow = {
  id: string;
  sessionDate: Date;
  updatedAt: Date;
};

type StudentRecordRow = {
  status: AttendanceStatus;
  note: string;
};

type PendingRow = {
  id: string;
  note: string;
  createdAt: Date;
};

export type AttendanceAggregateSessionRow = {
  id: string;
  offeringId: string;
  sessionDate: Date;
};

export type AttendanceAggregateRecordRow = {
  sessionId: string;
  status: AttendanceStatus;
};

export type AttendanceAggregatePendingRow = {
  sessionId: string;
};

export type StudentAttendanceHealthSummary = {
  offeringId: string;
  history: {
    totalSessions: number;
    markedSessions: number;
    attendanceRate: number | null;
    counts: Record<AttendanceStatus, number> & { PermissionPending: number };
  };
  health: ReturnType<typeof evaluateAttendanceHealth>["health"];
};

type StudentLookup = {
  getByUserId(userId: string): Promise<{
    id: string;
    studentId: string;
    status: string;
  } | null>;
};

const students = () => registry.get<StudentLookup>("students").service;

function emptyCounts(): Record<AttendanceStatus, number> & { PermissionPending: number } {
  return { Present: 0, Absent: 0, Late: 0, Excused: 0, PermissionPending: 0 };
}

export function summarizeStudentAttendanceHealthByOffering(
  offeringIds: string[],
  sessions: AttendanceAggregateSessionRow[],
  records: AttendanceAggregateRecordRow[],
  pendingRows: AttendanceAggregatePendingRow[],
): StudentAttendanceHealthSummary[] {
  const uniqueOfferingIds = [...new Set(offeringIds)];
  const sessionsByOffering = new Map<string, AttendanceAggregateSessionRow[]>();
  for (const session of sessions) {
    const current = sessionsByOffering.get(session.offeringId) ?? [];
    current.push(session);
    sessionsByOffering.set(session.offeringId, current);
  }

  const recordBySession = new Map(records.map((record) => [record.sessionId, record]));
  const pendingSessionIds = new Set(pendingRows.map((pending) => pending.sessionId));

  return uniqueOfferingIds.map((offeringId) => {
    const offeringSessions = sessionsByOffering.get(offeringId) ?? [];
    const counts = emptyCounts();
    const healthRecords: AttendanceHealthRecord[] = [];

    for (const session of offeringSessions) {
      const record = recordBySession.get(session.id);
      const date = session.sessionDate.toISOString().slice(0, 10);
      if (record) {
        counts[record.status] += 1;
        healthRecords.push({ sessionId: session.id, date, status: record.status });
      } else if (pendingSessionIds.has(session.id)) {
        counts.PermissionPending += 1;
      }
    }

    const markedSessions = counts.Present + counts.Absent + counts.Late + counts.Excused;
    const attended = counts.Present + counts.Late;
    const { health } = evaluateAttendanceHealth(healthRecords, counts);
    return {
      offeringId,
      history: {
        totalSessions: offeringSessions.length,
        markedSessions,
        attendanceRate: markedSessions === 0
          ? null
          : Math.round((attended / markedSessions) * 10_000) / 100,
        counts,
      },
      health,
    };
  });
}

async function historyForStudent(
  student: { id: string; studentId: string },
  offeringId: string,
): Promise<TelegramStudentAttendanceHistory> {
  const sessions = await prisma.$queryRaw<SessionRow[]>`
    SELECT "id", "sessionDate", "updatedAt"
    FROM "pms_attendance"."AttendanceSession"
    WHERE "offeringId" = ${offeringId}
    ORDER BY "sessionDate" DESC
  `;

  const counts = emptyCounts();
  const healthRecords: AttendanceHealthRecord[] = [];
  const history: TelegramStudentAttendanceHistory["history"] = [];

  for (const session of sessions) {
    const records = await prisma.$queryRaw<StudentRecordRow[]>`
      SELECT "status", "note"
      FROM "pms_attendance"."AttendanceRecord"
      WHERE "sessionId" = ${session.id}
        AND "studentId" = ${student.id}
      LIMIT 1
    `;
    const pendingRows = await prisma.$queryRaw<PendingRow[]>`
      SELECT "id", "note", "createdAt"
      FROM "pms_attendance"."AttendancePermissionPending"
      WHERE "sessionId" = ${session.id}
        AND "studentId" = ${student.id}
        AND "resolvedAt" IS NULL
      LIMIT 1
    `;
    const record = records[0] ?? null;
    const pending = record ? null : pendingRows[0] ?? null;
    const date = session.sessionDate.toISOString().slice(0, 10);
    if (record) {
      counts[record.status] += 1;
      healthRecords.push({ sessionId: session.id, date, status: record.status });
    } else if (pending) {
      counts.PermissionPending += 1;
    }
    history.push({
      sessionId: session.id,
      date,
      status: record?.status ?? null,
      permissionPending: Boolean(pending),
      permissionPendingSince: pending?.createdAt.toISOString() ?? null,
      note: record?.note ?? pending?.note ?? "",
      updatedAt: session.updatedAt.toISOString(),
    });
  }

  const marked = counts.Present + counts.Absent + counts.Late + counts.Excused;
  const attended = counts.Present + counts.Late;
  const { health } = evaluateAttendanceHealth(healthRecords, counts);
  return {
    offeringId,
    studentId: student.id,
    studentNumber: student.studentId,
    totalSessions: sessions.length,
    markedSessions: marked,
    attendanceRate: marked === 0 ? null : Math.round((attended / marked) * 10_000) / 100,
    counts,
    health,
    history,
  };
}

export const studentAttendanceHistoryService = {
  async forUser(userId: string, offeringId: string): Promise<TelegramStudentAttendanceHistory> {
    const student = await students().getByUserId(userId);
    if (!student || student.status !== "Active") {
      throw new ReferenceError("No active student profile is linked to this account");
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { offeringId_studentId: { offeringId, studentId: student.id } },
      select: { id: true },
    });
    if (!enrollment) throw new ReferenceError("Student is not enrolled in this offering");
    return historyForStudent(student, offeringId);
  },

  async healthForStudent(studentId: string, offeringId: string) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, studentId: true },
    });
    if (!student) return null;
    const history = await historyForStudent(student, offeringId);
    const finalized = history.history
      .filter((row): row is typeof row & { status: AttendanceStatus } => row.status !== null)
      .map((row) => ({ sessionId: row.sessionId, date: row.date, status: row.status }));
    const evaluation = evaluateAttendanceHealth(finalized, history.counts);
    return { history, ...evaluation };
  },

  async healthForStudentOfferings(
    studentId: string,
    offeringIds: string[],
  ): Promise<StudentAttendanceHealthSummary[]> {
    const uniqueOfferingIds = [...new Set(offeringIds)];
    if (uniqueOfferingIds.length === 0) return [];

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) return [];

    const sessions = await prisma.$queryRaw<AttendanceAggregateSessionRow[]>(Prisma.sql`
      SELECT "id", "offeringId", "sessionDate"
      FROM "pms_attendance"."AttendanceSession"
      WHERE "offeringId" IN (${Prisma.join(uniqueOfferingIds)})
      ORDER BY "offeringId", "sessionDate" DESC
    `);

    if (sessions.length === 0) {
      return summarizeStudentAttendanceHealthByOffering(uniqueOfferingIds, [], [], []);
    }

    const sessionIds = sessions.map((session) => session.id);
    const [records, pendingRows] = await Promise.all([
      prisma.$queryRaw<AttendanceAggregateRecordRow[]>(Prisma.sql`
        SELECT "sessionId", "status"
        FROM "pms_attendance"."AttendanceRecord"
        WHERE "studentId" = ${studentId}
          AND "sessionId" IN (${Prisma.join(sessionIds)})
      `),
      prisma.$queryRaw<AttendanceAggregatePendingRow[]>(Prisma.sql`
        SELECT "sessionId"
        FROM "pms_attendance"."AttendancePermissionPending"
        WHERE "studentId" = ${studentId}
          AND "sessionId" IN (${Prisma.join(sessionIds)})
          AND "resolvedAt" IS NULL
      `),
    ]);

    return summarizeStudentAttendanceHealthByOffering(
      uniqueOfferingIds,
      sessions,
      records,
      pendingRows,
    );
  },

  async pendingForUser(userId: string) {
    const student = await students().getByUserId(userId);
    if (!student || student.status !== "Active") return [];
    return prisma.$queryRaw<Array<{
      permissionPendingId: string;
      offeringId: string;
      date: Date;
      createdAt: Date;
      note: string;
      courseCode: string;
      courseTitle: string;
      sectionCode: string;
    }>>`
      SELECT
        p."id" AS "permissionPendingId",
        s."offeringId",
        s."sessionDate" AS "date",
        p."createdAt",
        p."note",
        c."code" AS "courseCode",
        c."title" AS "courseTitle",
        o."sectionCode"
      FROM "pms_attendance"."AttendancePermissionPending" p
      JOIN "pms_attendance"."AttendanceSession" s ON s."id" = p."sessionId"
      JOIN "Offering" o ON o."id" = s."offeringId"
      JOIN "Course" c ON c."id" = o."courseId"
      JOIN "Enrollment" e ON e."offeringId" = o."id" AND e."studentId" = p."studentId"
      WHERE p."studentId" = ${student.id}
        AND p."resolvedAt" IS NULL
      ORDER BY s."sessionDate" DESC
    `;
  },
};
