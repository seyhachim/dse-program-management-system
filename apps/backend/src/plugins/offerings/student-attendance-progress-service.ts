import { Prisma } from "@prisma/client";
import type { AttendanceStatus } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

export type StudentAttendanceProgressSummary = {
  offeringId: string;
  totalSessions: number;
  markedSessions: number;
  attendanceRate: number | null;
  counts: Record<AttendanceStatus, number> & { PermissionPending: number };
  sessions: Array<{
    date: string;
    status: AttendanceStatus | null;
    permissionPending: boolean;
  }>;
};

type SessionRow = {
  id: string;
  offeringId: string;
  sessionDate: Date;
};

type RecordRow = {
  sessionId: string;
  status: AttendanceStatus;
};

type PendingRow = {
  sessionId: string;
};

function emptyCounts(): Record<AttendanceStatus, number> & { PermissionPending: number } {
  return {
    Present: 0,
    Absent: 0,
    Late: 0,
    Excused: 0,
    PermissionPending: 0,
  };
}

export function summarizeStudentAttendanceProgress(
  offeringIds: string[],
  sessions: SessionRow[],
  records: RecordRow[],
  pendingRows: PendingRow[],
): StudentAttendanceProgressSummary[] {
  const uniqueOfferingIds = [...new Set(offeringIds)];
  const sessionsByOffering = new Map<string, SessionRow[]>();
  for (const session of sessions) {
    const current = sessionsByOffering.get(session.offeringId) ?? [];
    current.push(session);
    sessionsByOffering.set(session.offeringId, current);
  }

  const recordBySession = new Map(records.map((record) => [record.sessionId, record]));
  const pendingSessionIds = new Set(pendingRows.map((pending) => pending.sessionId));

  return uniqueOfferingIds.map((offeringId) => {
    const offeringSessions = (sessionsByOffering.get(offeringId) ?? []).sort(
      (left, right) => left.sessionDate.getTime() - right.sessionDate.getTime(),
    );
    const counts = emptyCounts();
    const safeSessions = offeringSessions.map((session) => {
      const record = recordBySession.get(session.id);
      const permissionPending = !record && pendingSessionIds.has(session.id);
      if (record) counts[record.status] += 1;
      else if (permissionPending) counts.PermissionPending += 1;
      return {
        date: session.sessionDate.toISOString().slice(0, 10),
        status: record?.status ?? null,
        permissionPending,
      };
    });
    const markedSessions = counts.Present + counts.Absent + counts.Late + counts.Excused;
    const attended = counts.Present + counts.Late;

    return {
      offeringId,
      totalSessions: offeringSessions.length,
      markedSessions,
      attendanceRate:
        markedSessions === 0
          ? null
          : Math.round((attended / markedSessions) * 10_000) / 100,
      counts,
      sessions: safeSessions,
    };
  });
}

export const studentAttendanceProgressService = {
  async forStudentOfferings(
    studentId: string,
    offeringIds: string[],
  ): Promise<StudentAttendanceProgressSummary[]> {
    const uniqueOfferingIds = [...new Set(offeringIds)];
    if (uniqueOfferingIds.length === 0) return [];

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) return [];

    const sessions = await prisma.$queryRaw<SessionRow[]>(Prisma.sql`
      SELECT "id", "offeringId", "sessionDate"
      FROM "pms_attendance"."AttendanceSession"
      WHERE "offeringId" IN (${Prisma.join(uniqueOfferingIds)})
      ORDER BY "offeringId", "sessionDate" ASC
    `);
    if (sessions.length === 0) {
      return summarizeStudentAttendanceProgress(uniqueOfferingIds, [], [], []);
    }

    const sessionIds = sessions.map((session) => session.id);
    const [records, pendingRows] = await Promise.all([
      prisma.$queryRaw<RecordRow[]>(Prisma.sql`
        SELECT "sessionId", "status"
        FROM "pms_attendance"."AttendanceRecord"
        WHERE "studentId" = ${studentId}
          AND "sessionId" IN (${Prisma.join(sessionIds)})
      `),
      prisma.$queryRaw<PendingRow[]>(Prisma.sql`
        SELECT "sessionId"
        FROM "pms_attendance"."AttendancePermissionPending"
        WHERE "studentId" = ${studentId}
          AND "sessionId" IN (${Prisma.join(sessionIds)})
          AND "resolvedAt" IS NULL
      `),
    ]);

    return summarizeStudentAttendanceProgress(
      uniqueOfferingIds,
      sessions,
      records,
      pendingRows,
    );
  },
};
