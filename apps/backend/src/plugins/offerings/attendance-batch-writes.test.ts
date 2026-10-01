import { describe, expect, test } from "bun:test";
import { Prisma } from "@prisma/client";
import {
  insertAttendanceCheck1Batch,
  replaceAttendanceRecordsBatch,
  type AttendanceWriteRow,
} from "./attendance-batch-writes.ts";

function captureTransaction() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const tx = {
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const query = Prisma.sql(strings, ...values);
      calls.push({ sql: query.sql, values: query.values });
      return 1;
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}

function mark(index: number, status: AttendanceWriteRow["status"] = "Present"): AttendanceWriteRow {
  return {
    studentId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    studentNumber: null,
    studentName: `Student ${index}`,
    status,
    permissionPending: status === null,
    note: index === 0 ? "Student's note'); DROP TABLE fake; --" : "",
  };
}

describe("attendance set-based writes", () => {
  test("43 first observations use one parameterized insert and preserve pending, null ID and actor", async () => {
    const { tx, calls } = captureTransaction();
    const rows = Array.from({ length: 43 }, (_, i) => mark(i, i < 5 ? null : "Present"));
    await insertAttendanceCheck1Batch(tx, "session-1", rows, "lecturer-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain("ON CONFLICT (\"sessionId\", \"studentId\", \"checkNumber\") DO NOTHING");
    expect(calls[0]!.sql).not.toContain("DROP TABLE");
    // checkNumber is the SQL literal 1; the other nine values are parameterized.
    expect(calls[0]!.values).toHaveLength(43 * 9);
    expect(calls[0]!.values).toContain("Student's note'); DROP TABLE fake; --");
    expect(calls[0]!.values).toContain(true);
    expect(calls[0]!.values).toContain(null);
    expect(calls[0]!.values).toContain("lecturer-1");
    expect(calls[0]!.values.filter((_, index) => index % 9 === 2)).toEqual(
      rows.map((row) => row.studentId),
    );
  });

  test("replacement deletes once and inserts only 38 finalized marks in one statement", async () => {
    const { tx, calls } = captureTransaction();
    const rows = Array.from({ length: 43 }, (_, i) => mark(i, i < 5 ? null : "Present"));
    await replaceAttendanceRecordsBatch(tx, "session-1", rows);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.sql).toContain("DELETE FROM");
    expect(calls[1]!.sql).toContain("INSERT INTO");
    expect(calls[1]!.values).toHaveLength(38 * 6);
    expect(calls[1]!.values).not.toContain(rows[0]!.studentId);
  });

  test("all pending leaves final truth empty and still clears old finalized rows", async () => {
    const { tx, calls } = captureTransaction();
    await replaceAttendanceRecordsBatch(tx, "session-1", [mark(0, null)]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain("DELETE FROM");
  });

  test("empty checkpoint batch performs no SQL", async () => {
    const { tx, calls } = captureTransaction();
    await insertAttendanceCheck1Batch(tx, "session-1", []);
    expect(calls).toHaveLength(0);
  });
});
