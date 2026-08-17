import type { AttendanceStatus } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
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

type StudentLookup = {
  getByUserId(userId: string): Promise<{
    id: string;
    studentId: string;
    status: string;
  } | null>;
};

const students = () => registry.get<StudentLookup>("students").service;

function emptyCounts(): Record<AttendanceStatus, number> {
  return { Present: 0, Absent: 0, Late: 0, Excused: 0 };
}

export const studentAttendanceHistoryService = {
  async forUser(userId: string, offeringId: string) {
    const student = await students().getByUserId(userId);
    if (!student || student.status !== "Active") {
      throw new ReferenceError("No active student profile is linked to this account");
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { offeringId_studentId: { offeringId, studentId: student.id } },
      select: { id: true },
    });
    if (!enrollment) throw new ReferenceError("Student is not enrolled in this offering");

    const sessions = await prisma.$queryRaw<SessionRow[]>`
      SELECT "id", "sessionDate", "updatedAt"
      FROM "pms_attendance"."AttendanceSession"
      WHERE "offeringId" = ${offeringId}
      ORDER BY "sessionDate" DESC
    `;

    const counts = emptyCounts();
    const history: Array<{
      sessionId: string;
      date: string;
      status: AttendanceStatus | null;
      note: string;
      updatedAt: string;
    }> = [];

    for (const session of sessions) {
      const records = await prisma.$queryRaw<StudentRecordRow[]>`
        SELECT "status", "note"
        FROM "pms_attendance"."AttendanceRecord"
        WHERE "sessionId" = ${session.id}
          AND "studentId" = ${student.id}
        LIMIT 1
      `;
      const record = records[0] ?? null;
      if (record) counts[record.status] += 1;
      history.push({
        sessionId: session.id,
        date: session.sessionDate.toISOString().slice(0, 10),
        status: record?.status ?? null,
        note: record?.note ?? "",
        updatedAt: session.updatedAt.toISOString(),
      });
    }

    const marked = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const attended = counts.Present + counts.Late;
    return {
      offeringId,
      studentId: student.id,
      studentNumber: student.studentId,
      totalSessions: sessions.length,
      markedSessions: marked,
      attendanceRate: marked === 0 ? null : Math.round((attended / marked) * 10_000) / 100,
      counts,
      history,
    };
  },
};
