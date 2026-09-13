import type { Prisma } from "@prisma/client";
import type {
  AttendanceCheckpointView,
  AttendanceStatus,
  AttendanceStudentHistoryView,
  RecheckAttendanceData,
  StudentsServiceContract,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { ReferenceError } from "./service.ts";
import { studentAttendanceHistoryService } from "./student-attendance-history-service.ts";

const students = () => registry.get<StudentsServiceContract>("students").service;

export class AttendanceRecheckConflictError extends Error {}

export interface AttendanceCheckpointRow {
  id: string;
  sessionId: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  checkNumber: number;
  status: AttendanceStatus | null;
  permissionPending: boolean;
  note: string;
  checkedById: string | null;
  checkedAt: Date;
}

type SessionRow = {
  id: string;
  sessionDate: Date;
  updatedAt: Date;
};

type ActivePendingRow = {
  id: string;
};

type HistoryRow = {
  sessionId: string;
  sessionDate: Date;
  updatedAt: Date;
  status: AttendanceStatus | null;
  recordNote: string | null;
  pendingId: string | null;
  pendingNote: string | null;
};

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

function dateValue(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toCheckpointView(row: AttendanceCheckpointRow): AttendanceCheckpointView {
  return {
    checkNumber: row.checkNumber === 2 ? 2 : 1,
    status: row.status,
    permissionPending: row.permissionPending,
    note: row.note,
    checkedAt: row.checkedAt.toISOString(),
    checkedById: row.checkedById,
  };
}

export async function loadAttendanceCheckpoints(
  sessionId: string,
): Promise<Map<string, AttendanceCheckpointRow[]>> {
  const rows = await prisma.$queryRaw<AttendanceCheckpointRow[]>`
    SELECT "id", "sessionId", "studentId", "studentNumber", "studentName",
           "checkNumber", "status", "permissionPending", "note", "checkedById", "checkedAt"
    FROM "pms_attendance"."AttendanceCheckpoint"
    WHERE "sessionId" = ${sessionId}
    ORDER BY "studentId", "checkNumber"
  `;
  const byStudent = new Map<string, AttendanceCheckpointRow[]>();
  for (const row of rows) {
    const current = byStudent.get(row.studentId) ?? [];
    current.push(row);
    byStudent.set(row.studentId, current);
  }
  return byStudent;
}

export async function captureAttendanceCheck1(
  tx: Prisma.TransactionClient,
  input: {
    sessionId: string;
    studentId: string;
    studentNumber: string;
    studentName: string;
    status: AttendanceStatus | null;
    permissionPending: boolean;
    note: string;
    actorUserId?: string;
  },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "pms_attendance"."AttendanceCheckpoint"
      ("id", "sessionId", "studentId", "studentNumber", "studentName", "checkNumber",
       "status", "permissionPending", "note", "checkedById")
    VALUES (
      ${crypto.randomUUID()}, ${input.sessionId}, ${input.studentId}, ${input.studentNumber},
      ${input.studentName}, 1, ${input.status}, ${input.permissionPending}, ${input.note},
      ${input.actorUserId ?? null}
    )
    ON CONFLICT ("sessionId", "studentId", "checkNumber") DO NOTHING
  `;
}

async function deliverRecheckNotifications(
  offeringId: string,
  date: string,
  studentId: string,
  newlyPendingId: string | null,
) {
  if (!registry.has("telegram")) return;
  const telegram = registry.get<TelegramNotificationContract>("telegram").service;
  const work: Array<Promise<void>> = [];
  if (newlyPendingId) {
    work.push(
      telegram.notifications.deliverPermissionPending({
        permissionPendingId: newlyPendingId,
        studentId,
        offeringId,
        date,
      }),
    );
  }
  const evaluation = await studentAttendanceHistoryService.healthForStudent(studentId, offeringId);
  if (evaluation) {
    for (const candidate of evaluation.warningCandidates) {
      work.push(
        telegram.notifications.deliverAttendanceWarning({
          studentId,
          offeringId,
          warningKind: candidate.kind,
          count: candidate.count,
          eventSessionId: candidate.eventSessionId,
          absentCount: evaluation.history.counts.Absent,
          excusedCount: evaluation.history.counts.Excused,
        }),
      );
    }
  }
  await Promise.allSettled(work);
}

export const attendanceRecheckService = {
  async recheck(
    offeringId: string,
    date: string,
    input: RecheckAttendanceData,
    actorUserId: string,
  ): Promise<void> {
    const studentRows = await students().findByIds([input.studentId]);
    const student = studentRows[0] ?? null;
    if (!student) throw new ReferenceError("Student no longer exists");
    if (!student.studentId) {
      throw new ReferenceError("Official Student ID is required before attendance can be rechecked");
    }

    let newlyPendingId: string | null = null;
    await prisma.$transaction(async (tx) => {
      const enrollments = await tx.$queryRaw<Array<{ studentId: string }>>`
        SELECT "studentId"
        FROM "Enrollment"
        WHERE "offeringId" = ${offeringId} AND "studentId" = ${input.studentId}
        FOR SHARE
      `;
      if (enrollments.length === 0) {
        throw new ReferenceError("Only students currently enrolled in this class can be rechecked");
      }

      const sessions = await tx.$queryRaw<SessionRow[]>`
        SELECT "id", "sessionDate", "updatedAt"
        FROM "pms_attendance"."AttendanceSession"
        WHERE "offeringId" = ${offeringId} AND "sessionDate" = ${dateValue(date)}
        LIMIT 1 FOR UPDATE
      `;
      const session = sessions[0] ?? null;
      if (!session) {
        throw new AttendanceRecheckConflictError("Save the first roll call before rechecking students");
      }

      const checkpoints = await tx.$queryRaw<AttendanceCheckpointRow[]>`
        SELECT "id", "sessionId", "studentId", "studentNumber", "studentName",
               "checkNumber", "status", "permissionPending", "note", "checkedById", "checkedAt"
        FROM "pms_attendance"."AttendanceCheckpoint"
        WHERE "sessionId" = ${session.id} AND "studentId" = ${input.studentId}
        ORDER BY "checkNumber"
        FOR UPDATE
      `;
      if (!checkpoints.some((checkpoint) => checkpoint.checkNumber === 1)) {
        throw new AttendanceRecheckConflictError("This student does not have Check 1 yet; save the initial roll call first");
      }
      if (checkpoints.some((checkpoint) => checkpoint.checkNumber === 2)) {
        throw new AttendanceRecheckConflictError("Check 2 has already been recorded for this student");
      }

      await tx.$executeRaw`
        INSERT INTO "pms_attendance"."AttendanceCheckpoint"
          ("id", "sessionId", "studentId", "studentNumber", "studentName", "checkNumber",
           "status", "permissionPending", "note", "checkedById")
        VALUES (
          ${crypto.randomUUID()}, ${session.id}, ${input.studentId}, ${student.studentId},
          ${student.name}, 2, ${input.observation.status}, ${input.observation.permissionPending},
          ${input.observation.note}, ${actorUserId}
        )
      `;

      const activePendingRows = await tx.$queryRaw<ActivePendingRow[]>`
        SELECT "id"
        FROM "pms_attendance"."AttendancePermissionPending"
        WHERE "sessionId" = ${session.id}
          AND "studentId" = ${input.studentId}
          AND "resolvedAt" IS NULL
        LIMIT 1 FOR UPDATE
      `;
      const activePending = activePendingRows[0] ?? null;

      if (input.final.permissionPending) {
        await tx.$executeRaw`
          DELETE FROM "pms_attendance"."AttendanceRecord"
          WHERE "sessionId" = ${session.id} AND "studentId" = ${input.studentId}
        `;
        if (activePending) {
          await tx.$executeRaw`
            UPDATE "pms_attendance"."AttendancePermissionPending"
            SET "note" = ${input.final.note}, "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${activePending.id}
          `;
        } else {
          newlyPendingId = crypto.randomUUID();
          await tx.$executeRaw`
            INSERT INTO "pms_attendance"."AttendancePermissionPending"
              ("id", "sessionId", "studentId", "studentNumber", "studentName", "note", "createdById")
            VALUES (
              ${newlyPendingId}, ${session.id}, ${input.studentId}, ${student.studentId},
              ${student.name}, ${input.final.note}, ${actorUserId}
            )
          `;
        }
      } else {
        if (activePending) {
          await tx.$executeRaw`
            UPDATE "pms_attendance"."AttendancePermissionPending"
            SET "resolvedAt" = CURRENT_TIMESTAMP, "resolvedById" = ${actorUserId},
                "resolution" = ${input.final.status}, "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${activePending.id} AND "resolvedAt" IS NULL
          `;
        }
        await tx.$executeRaw`
          INSERT INTO "pms_attendance"."AttendanceRecord"
            ("sessionId", "studentId", "studentNumber", "studentName", "status", "note")
          VALUES (
            ${session.id}, ${input.studentId}, ${student.studentId}, ${student.name},
            ${input.final.status}, ${input.final.note}
          )
          ON CONFLICT ("sessionId", "studentId") DO UPDATE
          SET "studentNumber" = EXCLUDED."studentNumber",
              "studentName" = EXCLUDED."studentName",
              "status" = EXCLUDED."status",
              "note" = EXCLUDED."note"
        `;
      }

      await tx.$executeRaw`
        UPDATE "pms_attendance"."AttendanceSession"
        SET "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${session.id}
      `;
    });

    await deliverRecheckNotifications(offeringId, date, input.studentId, newlyPendingId);
  },

  async history(offeringId: string, studentId: string): Promise<AttendanceStudentHistoryView> {
    const eligible = await prisma.$queryRaw<Array<{ ok: number }>>`
      SELECT 1 AS "ok"
      WHERE EXISTS (
        SELECT 1 FROM "Enrollment"
        WHERE "offeringId" = ${offeringId} AND "studentId" = ${studentId}
      ) OR EXISTS (
        SELECT 1
        FROM "pms_attendance"."AttendanceSession" session
        LEFT JOIN "pms_attendance"."AttendanceRecord" record
          ON record."sessionId" = session."id" AND record."studentId" = ${studentId}
        LEFT JOIN "pms_attendance"."AttendancePermissionPending" pending
          ON pending."sessionId" = session."id" AND pending."studentId" = ${studentId}
        LEFT JOIN "pms_attendance"."AttendanceCheckpoint" checkpoint
          ON checkpoint."sessionId" = session."id" AND checkpoint."studentId" = ${studentId}
        WHERE session."offeringId" = ${offeringId}
          AND (record."studentId" IS NOT NULL OR pending."studentId" IS NOT NULL OR checkpoint."studentId" IS NOT NULL)
      )
      LIMIT 1
    `;
    if (eligible.length === 0) {
      throw new ReferenceError("Student has no attendance relationship with this offering");
    }

    const rows = await prisma.$queryRaw<HistoryRow[]>`
      SELECT session."id" AS "sessionId", session."sessionDate", session."updatedAt",
             record."status", record."note" AS "recordNote",
             pending."id" AS "pendingId", pending."note" AS "pendingNote"
      FROM "pms_attendance"."AttendanceSession" session
      LEFT JOIN "pms_attendance"."AttendanceRecord" record
        ON record."sessionId" = session."id" AND record."studentId" = ${studentId}
      LEFT JOIN LATERAL (
        SELECT p."id", p."note"
        FROM "pms_attendance"."AttendancePermissionPending" p
        WHERE p."sessionId" = session."id"
          AND p."studentId" = ${studentId}
          AND p."resolvedAt" IS NULL
        ORDER BY p."createdAt" DESC
        LIMIT 1
      ) pending ON true
      WHERE session."offeringId" = ${offeringId}
        AND (record."studentId" IS NOT NULL OR pending."id" IS NOT NULL)
      ORDER BY session."sessionDate" DESC
      LIMIT 8
    `;

    return {
      offeringId,
      studentId,
      history: rows.map((row) => ({
        sessionId: row.sessionId,
        date: row.sessionDate.toISOString().slice(0, 10),
        status: row.status,
        permissionPending: row.status === null && row.pendingId !== null,
        note: row.recordNote ?? row.pendingNote ?? "",
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  },
};
