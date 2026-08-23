import { describe, expect, test } from "bun:test";
import { evaluateAttendanceHealth, type AttendanceHealthRecord } from "./attendance-health.ts";

function record(sessionId: string, date: string, status: AttendanceHealthRecord["status"]): AttendanceHealthRecord {
  return { sessionId, date, status };
}

describe("attendance health evaluator", () => {
  test("keeps healthy progress factual and positive", () => {
    const result = evaluateAttendanceHealth([
      record("s1", "2026-08-21", "Present"),
      record("s2", "2026-08-22", "Late"),
      record("s3", "2026-08-23", "Present"),
    ], { Absent: 0, Excused: 0 });

    expect(result.health.state).toBe("healthy");
    expect(result.health.attendanceStreak).toBe(3);
    expect(result.health.onTimeStreak).toBe(1);
    expect(result.warningCandidates).toEqual([]);
  });

  test("two combined absent/excused records create a watch while three create a warning", () => {
    const rows = [
      record("a1", "2026-08-20", "Absent"),
      record("p1", "2026-08-21", "Excused"),
      record("a2", "2026-08-22", "Absent"),
    ];

    const watch = evaluateAttendanceHealth(rows.slice(0, 2), { Absent: 1, Excused: 1 });
    expect(watch.health.state).toBe("watch");
    expect(watch.health.signals[0]?.kind).toBe("attendance");
    expect(watch.warningCandidates).toEqual([]);

    const warning = evaluateAttendanceHealth(rows, { Absent: 2, Excused: 1 });
    expect(warning.health.state).toBe("warning");
    expect(warning.health.absencePermissionCount).toBe(3);
    expect(warning.health.signals.find((signal) => signal.kind === "attendance")?.message).toContain("2 absent");
    expect(warning.warningCandidates).toEqual([
      { kind: "attendance", count: 3, eventSessionId: "a2" },
    ]);
  });

  test("combined P/A remains a warning above threshold without repeat notification candidates", () => {
    const result = evaluateAttendanceHealth([
      record("a1", "2026-08-19", "Absent"),
      record("p1", "2026-08-20", "Excused"),
      record("a2", "2026-08-21", "Absent"),
      record("p2", "2026-08-22", "Excused"),
    ], { Absent: 2, Excused: 2 });

    expect(result.health.state).toBe("warning");
    expect(result.health.absencePermissionCount).toBe(4);
    expect(result.warningCandidates).toEqual([]);
  });

  test("two consecutive late records are advice-only and three generate a warning candidate", () => {
    const rows = [
      record("l1", "2026-08-20", "Late"),
      record("l2", "2026-08-21", "Late"),
      record("l3", "2026-08-22", "Late"),
    ];

    const watch = evaluateAttendanceHealth(rows.slice(0, 2), { Absent: 0, Excused: 0 });
    expect(watch.health.consecutiveLate).toBe(2);
    expect(watch.health.state).toBe("watch");
    expect(watch.warningCandidates).toEqual([]);

    const warning = evaluateAttendanceHealth(rows, { Absent: 0, Excused: 0 });
    expect(warning.health.consecutiveLate).toBe(3);
    expect(warning.health.state).toBe("warning");
    expect(warning.warningCandidates).toEqual([
      { kind: "punctuality", count: 3, eventSessionId: "l3" },
    ]);
  });

  test("five consecutive late records keep warning state with stronger support but no repeat Telegram candidate", () => {
    const result = evaluateAttendanceHealth([
      record("l1", "2026-08-18", "Late"),
      record("l2", "2026-08-19", "Late"),
      record("l3", "2026-08-20", "Late"),
      record("l4", "2026-08-21", "Late"),
      record("l5", "2026-08-22", "Late"),
    ], { Absent: 0, Excused: 0 });

    expect(result.health.state).toBe("warning");
    expect(result.health.consecutiveLate).toBe(5);
    expect(result.health.signals[0]?.title).toBe("Repeated lateness needs support");
    expect(result.health.signals[0]?.message).toContain("speak with your lecturer or adviser");
    expect(result.warningCandidates).toEqual([]);
  });

  test("a non-late finalized record resets the current late run", () => {
    const result = evaluateAttendanceHealth([
      record("l1", "2026-08-20", "Late"),
      record("l2", "2026-08-21", "Late"),
      record("p1", "2026-08-22", "Present"),
    ], { Absent: 0, Excused: 0 });

    expect(result.health.consecutiveLate).toBe(0);
    expect(result.health.state).toBe("healthy");
  });

  test("three present classes after an older late warning become recovery", () => {
    const result = evaluateAttendanceHealth([
      record("l1", "2026-08-10", "Late"),
      record("l2", "2026-08-11", "Late"),
      record("l3", "2026-08-12", "Late"),
      record("p1", "2026-08-20", "Present"),
      record("p2", "2026-08-21", "Present"),
      record("p3", "2026-08-22", "Present"),
    ], { Absent: 0, Excused: 0 });

    expect(result.health.onTimeStreak).toBe(3);
    expect(result.health.state).toBe("recovery");
    expect(result.health.message).toContain("Nice improvement");
  });

  test("active warnings take priority over recovery messaging", () => {
    const result = evaluateAttendanceHealth([
      record("a1", "2026-08-01", "Absent"),
      record("a2", "2026-08-02", "Absent"),
      record("a3", "2026-08-03", "Excused"),
      record("p1", "2026-08-20", "Present"),
      record("p2", "2026-08-21", "Present"),
      record("p3", "2026-08-22", "Present"),
    ], { Absent: 2, Excused: 1 });

    expect(result.health.state).toBe("warning");
    expect(result.health.message).not.toContain("Nice improvement");
  });
});
