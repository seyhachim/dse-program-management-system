import type { AttendanceStatus, TelegramStudentAttendanceHistory } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

interface StudentRow {
  id: string;
  studentId: string;
}

interface HistoryRow {
  sessionId: string;
  sessionDate: Date;
  status: AttendanceStatus | null;
  note: string | null;
  pendingId: string | null;
  pendingCreatedAt: Date | null;
  updatedAt: Date;
}

export const studentAttendanceHistoryService = {
  async forUser(userId: string, offeringId: string): Promise<TelegramStudentAttendanceHistory | null> {
    const students = await prisma.$queryRaw<StudentRow[]>`
      SELECT s."id", s."studentId"
      FROM "Student" s
      JOIN "Enrollment" e ON e."studentId" = s."id"
      WHERE s."userId" = ${userId}
        AND e."offeringId" = ${offeringId}
      LIMIT 1
    `;
    const student = students[0];
    if (!student) return null;

    const history = await prisma.$queryRaw<HistoryRow[]>`
      SELECT
        s."id" AS "sessionId",
        s."sessionDate",
        r."status",
        COALESCE(r."note", p."note", '') AS "note",
        p."id" AS "pendingId",
        p."createdAt" AS "pendingCreatedAt",
        s."updatedAt"
      FROM "pms_attendance"."AttendanceSession" s
      LEFT JOIN "pms_attendance"."AttendanceRecord" r
        ON r."sessionId" = s."id" AND r."studentId" = ${student.id}
      LEFT JOIN "pms_attendance"."AttendancePermissionPending" p
        ON p."sessionId" = s."id"
        AND p."studentId" = ${student.id}
        AND p."resolvedAt" IS NULL
      WHERE s."offeringId" = ${offeringId}
      ORDER BY s."sessionDate" DESC
    `;

    const counts = { Present: 0, Absent: 0, Late: 0, Excused: 0, PermissionPending: 0 };
    let markedSessions = 0;
    for (const row of history) {
      if (row.status) {
        counts[row.status] += 1;
        markedSessions += 1;
      } else if (row.pendingId) {
        counts.PermissionPending += 1;
      }
    }
    const attended = counts.Present + counts.Late + counts.Excused;

    return {
      offeringId,
      studentId: student.id,
      studentNumber: student.studentId,
      totalSessions: history.length,
      markedSessions,
      attendanceRate: markedSessions > 0 ? Math.round((attended / markedSessions) * 1000) / 10 : null,
      counts,
      history: history.map((row) => ({
        sessionId: row.sessionId,
        date: row.sessionDate.toISOString().slice(0, 10),
        status: row.status,
        permissionPending: row.status === null && row.pendingId !== null,
        permissionPendingSince: row.status === null && row.pendingCreatedAt ? row.pendingCreatedAt.toISOString() : null,
        note: row.note ?? "",
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  },

  async pendingForUser(userId: string) {
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
      JOIN "Student" st ON st."id" = p."studentId"
      WHERE st."userId" = ${userId}
        AND p."resolvedAt" IS NULL
      ORDER BY s."sessionDate" DESC
    `;
  },
};
