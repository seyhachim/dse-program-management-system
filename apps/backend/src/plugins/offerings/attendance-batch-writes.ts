import { Prisma, type AttendanceStatus as UnusedAttendanceStatus } from "@prisma/client";
import type { AttendanceStatus } from "@dse-pms/shared-types";

/** A validated, roster-authorized mark with its canonical or saved historical identity. */
export interface AttendanceWriteRow {
  studentId: string;
  studentNumber: string | null;
  studentName: string;
  status: AttendanceStatus | null;
  permissionPending: boolean;
  note: string;
}

/** First observations are append-only. The unique checkpoint key keeps retries immutable. */
export async function insertAttendanceCheck1Batch(
  tx: Prisma.TransactionClient,
  sessionId: string,
  rows: readonly AttendanceWriteRow[],
  actorUserId?: string,
): Promise<void> {
  if (rows.length === 0) return;
  const values = rows.map((row) => Prisma.sql`(
    ${crypto.randomUUID()}, ${sessionId}, ${row.studentId}, ${row.studentNumber},
    ${row.studentName}, 1, ${row.status}, ${row.permissionPending},
    ${row.note}, ${actorUserId ?? null}
  )`);
  await tx.$executeRaw`
    INSERT INTO "pms_attendance"."AttendanceCheckpoint"
      ("id", "sessionId", "studentId", "studentNumber", "studentName", "checkNumber",
       "status", "permissionPending", "note", "checkedById")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("sessionId", "studentId", "checkNumber") DO NOTHING
  `;
}

/** Replace only final truth; unresolved Permission Pending stays in its own table. */
export async function replaceAttendanceRecordsBatch(
  tx: Prisma.TransactionClient,
  sessionId: string,
  rows: readonly AttendanceWriteRow[],
): Promise<void> {
  await tx.$executeRaw`
    DELETE FROM "pms_attendance"."AttendanceRecord" WHERE "sessionId" = ${sessionId}
  `;
  const finalRows = rows.filter((row) => row.status !== null);
  if (finalRows.length === 0) return;
  const values = finalRows.map((row) => Prisma.sql`(
    ${sessionId}, ${row.studentId}, ${row.studentNumber},
    ${row.studentName}, ${row.status}, ${row.note}
  )`);
  await tx.$executeRaw`
    INSERT INTO "pms_attendance"."AttendanceRecord"
      ("sessionId", "studentId", "studentNumber", "studentName", "status", "note")
    VALUES ${Prisma.join(values)}
  `;
}
