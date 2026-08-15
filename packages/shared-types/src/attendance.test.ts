import { expect, test } from "bun:test";
import { AttendanceDateSchema, SaveAttendanceInput } from "./attendance.ts";

const STUDENT = "11111111-1111-1111-1111-111111111111";

test("attendance date accepts real ISO calendar dates", () => {
  expect(AttendanceDateSchema.safeParse("2026-08-15").success).toBe(true);
  expect(AttendanceDateSchema.safeParse("2026-02-30").success).toBe(false);
});

test("attendance save accepts status and note", () => {
  const parsed = SaveAttendanceInput.parse({
    records: [{ studentId: STUDENT, status: "Late", note: "Arrived 10 minutes late" }],
  });
  expect(parsed.records[0]?.status).toBe("Late");
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
