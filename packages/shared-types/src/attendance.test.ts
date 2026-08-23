import { expect, test } from "bun:test";
import { AttendanceDateSchema, SaveAttendanceInput } from "./attendance.ts";

const STUDENT = "11111111-1111-1111-1111-111111111111";

test("attendance date accepts real ISO calendar dates", () => {
  expect(AttendanceDateSchema.safeParse("2026-08-15").success).toBe(true);
  expect(AttendanceDateSchema.safeParse("2026-02-30").success).toBe(false);
});

test("attendance save accepts finalized status and note", () => {
  const parsed = SaveAttendanceInput.parse({
    records: [{ studentId: STUDENT, status: "Late", note: "Arrived 10 minutes late" }],
  });
  expect(parsed.records[0]?.status).toBe("Late");
  expect(parsed.records[0]?.permissionPending).toBe(false);
});

test("attendance save accepts Permission Pending without a finalized status", () => {
  const parsed = SaveAttendanceInput.parse({
    records: [{ studentId: STUDENT, status: null, permissionPending: true, note: "Paper letter to follow" }],
  });
  expect(parsed.records[0]?.status).toBeNull();
  expect(parsed.records[0]?.permissionPending).toBe(true);
});

test("attendance save rejects a finalized status combined with Permission Pending", () => {
  expect(SaveAttendanceInput.safeParse({
    records: [{ studentId: STUDENT, status: "Absent", permissionPending: true }],
  }).success).toBe(false);
});

test("attendance save rejects an empty unresolved mark", () => {
  expect(SaveAttendanceInput.safeParse({
    records: [{ studentId: STUDENT, status: null, permissionPending: false }],
  }).success).toBe(false);
});

test("attendance save rejects duplicate students", () => {
  const result = SaveAttendanceInput.safeParse({
    records: [
      { studentId: STUDENT, status: "Present" },
      { studentId: STUDENT, status: "Absent" },
    ],
  });
  expect(result.success).toBe(false);
});
