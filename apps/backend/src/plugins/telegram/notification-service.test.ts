import { describe, expect, test } from "bun:test";
import { attendanceWarningEventKey } from "./notification-service.ts";

describe("attendance warning notification keys", () => {
  test("are deterministic for the same threshold event", () => {
    const input = {
      studentId: "student-1",
      offeringId: "offering-1",
      warningKind: "attendance" as const,
      eventSessionId: "session-3",
    };
    expect(attendanceWarningEventKey(input)).toBe(attendanceWarningEventKey(input));
    expect(attendanceWarningEventKey(input)).toBe(
      "attendance-warning:student-1:offering-1:attendance:3:session-3",
    );
  });

  test("separates attendance and punctuality thresholds", () => {
    const base = { studentId: "student-1", offeringId: "offering-1", eventSessionId: "session-3" };
    expect(attendanceWarningEventKey({ ...base, warningKind: "attendance" })).not.toBe(
      attendanceWarningEventKey({ ...base, warningKind: "punctuality" }),
    );
  });
});
