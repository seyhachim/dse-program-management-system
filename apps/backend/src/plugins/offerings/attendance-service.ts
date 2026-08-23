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
import { studentAttendanceHistoryService } from "./student-attendance-history-service.ts";

const students = () => registry.get<StudentsServiceContract>("students").service;

type TelegramNotificationContract = {
  notifications: {
    deliverPermissionPending(input: {
      permissionPendingId: string;
      studentId: string;
      offeringId: string;
      date: string;
    }): Promise<void>;
    deliverAttendanceWarning(input: {
      studentId: string;
      offeringId: string;
      warningKind: "attendance" | "punctuality";
      count: number;
      eventSessionId: string;
      absentCount: number;
      excusedCount: number;
    }): Promise<void>;
  };
};

interface EnrollmentRow { studentId: string; }
interface SessionRow { id: string; offeringId: string; sessionDate: Date; updatedAt: Date; }
interface RecordRow {
  studentId: string;
  studentNumber: string;
  studentName: string;
  status: AttendanceStatus;
  note: string;
}
interface PendingRow {
  id: string;
  sessionId: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  note: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

function dateOnly(value: Date): string { return value.toISOString().slice(0, 10); }
function dateValue(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
function emptyCounts() {
  return { Present: 0, Absent: 0, Late: 0, Excused: 0, PermissionPending: 0 }
    satisfies Record<AttendanceStatus, number> & { PermissionPending: number };
}

async function roster(offeringId: string): Promise<EnrollmentRow[]> {
  return prisma.$queryRaw<EnrollmentRow[]>`SELECT "studentId" FROM "Enrollment" WHERE "offeringId" = ${offeringId}`;
}

async function sessionByDate(offeringId: string, date: string): Promise<SessionRow | null> {
  const rows = await prisma.$queryRaw<SessionRow[]>`
    SELECT "id", "offeringId", "sessionDate", "updatedAt"
    FROM "pms_attendance"."AttendanceSession"
    WHERE "offeringId" = ${offeringId} AND "sessionDate" = ${dateValue(date)} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function activePending(sessionId: string): Promise<PendingRow[]> {
  return prisma.$queryRaw<PendingRow[]>`
    SELECT "id", "sessionId", "studentId", "studentNumber", "studentName", "note", "createdAt", "resolvedAt"
    FROM "pms_attendance"."AttendancePermissionPending"
    WHERE "sessionId" = ${sessionId} AND "resolvedAt" IS NULL
  `;
}

async function getAttendance(offeringId: string, date: string): Promise<AttendanceSessionView> {
  const [enrollments, session] = await Promise.all([roster(offeringId), sessionByDate(offeringId, date)]);
  const currentStudentIds = enrollments.map((row) => row.studentId);
  const studentRows = await students().findByIds(currentStudentIds);
  const studentById = new Map(studentRows.map((student) => [student.id, student]));
  const recordRows = session ? await prisma.$queryRaw<RecordRow[]>`
    SELECT "studentId", "studentNumber", "studentName", "status", "note"
    FROM "pms_attendance"."AttendanceRecord" WHERE "sessionId" = ${session.id}
  ` : [];
  const pendingRows = session ? await activePending(session.id) : [];
  const recordByStudent = new Map(recordRows.map((record) => [record.studentId, record]));
  const pendingByStudent = new Map(pendingRows.map((pending) => [pending.studentId, pending]));
  const counts = { ...emptyCounts(), Unmarked: 0 };
  const records = currentStudentIds.map((studentId) => {
    const student = studentById.get(studentId);
    if (!student) return null;
    const attendance = recordByStudent.get(studentId);
    const pending = pendingByStudent.get(studentId);
    if (attendance) counts[attendance.status] += 1;
    else if (pending) counts.PermissionPending += 1;
    else counts.Unmarked += 1;
    return {
      studentId,
      studentNumber: attendance?.studentNumber ?? pending?.studentNumber ?? student.studentId,
      studentName: attendance?.studentName ?? pending?.studentName ?? student.name,
      status: attendance?.status ?? null,
      permissionPending: !attendance && Boolean(pending),
      permissionPendingSince: !attendance && pending ? pending.createdAt.toISOString() : null,
      note: attendance?.note ?? pending?.note ?? "",
    };
  }).filter((record): record is NonNullable<typeof record> => record !== null);

  const historicalIds = new Set(currentStudentIds);
  for (const historical of recordRows) {
    if (historicalIds.has(historical.studentId)) continue;
    historicalIds.add(historical.studentId);
    counts[historical.status] += 1;
    records.push({
      studentId: historical.studentId,
      studentNumber: historical.studentNumber,
      studentName: historical.studentName,
      status: historical.status,
      permissionPending: false,
      permissionPendingSince: null,
      note: historical.note,
    });
  }
  for (const pending of pendingRows) {
    if (historicalIds.has(pending.studentId)) continue;
    historicalIds.add(pending.studentId);
    counts.PermissionPending += 1;
    records.push({
      studentId: pending.studentId,
      studentNumber: pending.studentNumber,
      studentName: pending.studentName,
      status: null,
      permissionPending: true,
      permissionPendingSince: pending.createdAt.toISOString(),
      note: pending.note,
    });
  }
  records.sort((a, b) => a.studentNumber.localeCompare(b.studentNumber));
  return { sessionId: session?.id ?? null, offeringId, date, records, counts, updatedAt: session?.updatedAt.toISOString() ?? null };
}

async function deliverPostSaveNotifications(
  offeringId: string,
  date: string,
  requestedStudentIds: string[],
  newlyPending: Array<{ permissionPendingId: string; studentId: string }>,
) {
  if (!registry.has("telegram")) return;
  const telegram = registry.get<TelegramNotificationContract>("telegram").service;
  const work: Array<Promise<void>> = newlyPending.map((pending) =>
    telegram.notifications.deliverPermissionPending({ ...pending, offeringId, date }),
  );

  for (const studentId of requestedStudentIds) {
    const evaluation = await studentAttendanceHistoryService.healthForStudent(studentId, offeringId);
    if (!evaluation) continue;
    for (const candidate of evaluation.warningCandidates) {
      work.push(telegram.notifications.deliverAttendanceWarning({
        studentId,
        offeringId,
        warningKind: candidate.kind,
        count: candidate.count,
        eventSessionId: candidate.eventSessionId,
        absentCount: evaluation.history.counts.Absent,
        excusedCount: evaluation.history.counts.Excused,
      }));
    }
  }
  await Promise.allSettled(work);
}

export const attendanceService = {
  async list(offeringId: string): Promise<AttendanceSessionSummary[]> {
    const sessions = await prisma.$queryRaw<SessionRow[]>`
      SELECT "id", "offeringId", "sessionDate", "updatedAt"
      FROM "pms_attendance"."AttendanceSession" WHERE "offeringId" = ${offeringId}
      ORDER BY "sessionDate" DESC
    `;
    if (sessions.length === 0) return [];
    const counts = new Map<string, ReturnType<typeof emptyCounts>>();
    for (const session of sessions) counts.set(session.id, emptyCounts());
    for (const session of sessions) {
      const rows = await prisma.$queryRaw<Array<{ status: AttendanceStatus; count: bigint }>>`
        SELECT "status", COUNT(*)::bigint AS "count" FROM "pms_attendance"."AttendanceRecord"
        WHERE "sessionId" = ${session.id} GROUP BY "status"
      `;
      const sessionCounts = counts.get(session.id)!;
      for (const row of rows) sessionCounts[row.status] = Number(row.count);
      const pending = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count" FROM "pms_attendance"."AttendancePermissionPending"
        WHERE "sessionId" = ${session.id} AND "resolvedAt" IS NULL
      `;
      sessionCounts.PermissionPending = Number(pending[0]?.count ?? 0n);
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

  async save(offeringId: string, date: string, input: SaveAttendanceInput, actorUserId?: string): Promise<AttendanceSessionView> {
    const requestedStudentIds = [...new Set(input.records.map((record) => record.studentId))];
    const studentRows = await students().findByIds(requestedStudentIds);
    const studentById = new Map(studentRows.map((student) => [student.id, student]));
    const newlyPending: Array<{ permissionPendingId: string; studentId: string }> = [];

    await prisma.$transaction(async (tx) => {
      const enrollments = await tx.$queryRaw<EnrollmentRow[]>`
        SELECT "studentId" FROM "Enrollment" WHERE "offeringId" = ${offeringId} FOR SHARE
      `;
      const currentStudentIds = new Set(enrollments.map((row) => row.studentId));
      const existing = await tx.$queryRaw<SessionRow[]>`
        SELECT "id", "offeringId", "sessionDate", "updatedAt"
        FROM "pms_attendance"."AttendanceSession"
        WHERE "offeringId" = ${offeringId} AND "sessionDate" = ${dateValue(date)} LIMIT 1 FOR UPDATE
      `;
      const existingSession = existing[0] ?? null;
      const historicalRows = existingSession ? await tx.$queryRaw<RecordRow[]>`
        SELECT "studentId", "studentNumber", "studentName", "status", "note"
        FROM "pms_attendance"."AttendanceRecord" WHERE "sessionId" = ${existingSession.id}
      ` : [];
      const pendingHistory = existingSession ? await tx.$queryRaw<PendingRow[]>`
        SELECT "id", "sessionId", "studentId", "studentNumber", "studentName", "note", "createdAt", "resolvedAt"
        FROM "pms_attendance"."AttendancePermissionPending" WHERE "sessionId" = ${existingSession.id}
      ` : [];
      const historicalByStudent = new Map(historicalRows.map((record) => [record.studentId, record]));
      const pendingHistoryByStudent = new Map(pendingHistory.map((record) => [record.studentId, record]));
      const activePendingByStudent = new Map(pendingHistory.filter((record) => record.resolvedAt === null).map((record) => [record.studentId, record]));

      for (const record of input.records) {
        const isCurrent = currentStudentIds.has(record.studentId);
        const historical = historicalByStudent.get(record.studentId) ?? pendingHistoryByStudent.get(record.studentId);
        if (!isCurrent && !historical) throw new ReferenceError("Attendance can only be recorded for current students or students already present in this saved register");
        if (isCurrent && !studentById.has(record.studentId)) throw new ReferenceError("One or more attendance students no longer exist");
      }

      const sessionId = existingSession?.id ?? crypto.randomUUID();
      if (!existingSession) {
        await tx.$executeRaw`INSERT INTO "pms_attendance"."AttendanceSession" ("id", "offeringId", "sessionDate") VALUES (${sessionId}, ${offeringId}, ${dateValue(date)})`;
      } else {
        await tx.$executeRaw`UPDATE "pms_attendance"."AttendanceSession" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${sessionId}`;
      }

      const requestedByStudent = new Map(input.records.map((record) => [record.studentId, record]));
      for (const pending of activePendingByStudent.values()) {
        const requested = requestedByStudent.get(pending.studentId);
        if (requested?.permissionPending) continue;
        const resolution = requested?.status ?? "Cleared";
        await tx.$executeRaw`
          UPDATE "pms_attendance"."AttendancePermissionPending"
          SET "resolvedAt" = CURRENT_TIMESTAMP, "resolvedById" = ${actorUserId ?? null},
              "resolution" = ${resolution}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${pending.id} AND "resolvedAt" IS NULL
        `;
      }

      for (const requested of input.records) {
        if (!requested.permissionPending) continue;
        const currentStudent = currentStudentIds.has(requested.studentId) ? studentById.get(requested.studentId) : null;
        const historical = historicalByStudent.get(requested.studentId) ?? pendingHistoryByStudent.get(requested.studentId);
        const studentNumber = currentStudent?.studentId ?? historical!.studentNumber;
        const studentName = currentStudent?.name ?? historical!.studentName;
        const existingPending = activePendingByStudent.get(requested.studentId);
        if (existingPending) {
          await tx.$executeRaw`UPDATE "pms_attendance"."AttendancePermissionPending" SET "note" = ${requested.note}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${existingPending.id}`;
        } else {
          const id = crypto.randomUUID();
          await tx.$executeRaw`
            INSERT INTO "pms_attendance"."AttendancePermissionPending"
              ("id", "sessionId", "studentId", "studentNumber", "studentName", "note", "createdById")
            VALUES (${id}, ${sessionId}, ${requested.studentId}, ${studentNumber}, ${studentName}, ${requested.note}, ${actorUserId ?? null})
          `;
          newlyPending.push({ permissionPendingId: id, studentId: requested.studentId });
        }
      }

      await tx.$executeRaw`DELETE FROM "pms_attendance"."AttendanceRecord" WHERE "sessionId" = ${sessionId}`;
      for (const record of input.records) {
        if (record.status === null) continue;
        const currentStudent = currentStudentIds.has(record.studentId) ? studentById.get(record.studentId) : null;
        const historical = historicalByStudent.get(record.studentId) ?? pendingHistoryByStudent.get(record.studentId);
        const studentNumber = currentStudent?.studentId ?? historical!.studentNumber;
        const studentName = currentStudent?.name ?? historical!.studentName;
        await tx.$executeRaw`
          INSERT INTO "pms_attendance"."AttendanceRecord"
            ("sessionId", "studentId", "studentNumber", "studentName", "status", "note")
          VALUES (${sessionId}, ${record.studentId}, ${studentNumber}, ${studentName}, ${record.status}, ${record.note})
        `;
      }
    });

    await deliverPostSaveNotifications(offeringId, date, requestedStudentIds, newlyPending);
    return getAttendance(offeringId, date);
  },
};
