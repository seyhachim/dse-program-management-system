import { describe, expect, test } from "bun:test";
import { evaluateAttendanceHealth, type AttendanceHealthRecord } from "./attendance-health.ts";

function row(id: string, date: string, status: AttendanceHealthRecord["status"]): AttendanceHealthRecord {
  return { sessionId: id, date, status };
}

function kinds(result: ReturnType<typeof evaluateAttendanceHealth>) {
  return (result.health.achievements ?? []).map((achievement) => achievement.kind);
}

describe("attendance achievement derivation", () => {
  test("awards Perfect Week only when the latest finalized week has at least two all-Present records", () => {
    const perfect = evaluateAttendanceHealth([
      row("m", "2026-08-17", "Present"),
      row("w", "2026-08-19", "Present"),
      row("f", "2026-08-21", "Present"),
    ], { Absent: 0, Excused: 0 });
    expect(kinds(perfect)).toContain("perfect_week");

    const late = evaluateAttendanceHealth([
      row("m", "2026-08-17", "Present"),
      row("w", "2026-08-19", "Late"),
    ], { Absent: 0, Excused: 0 });
    expect(kinds(late)).not.toContain("perfect_week");
  });

  test("awards Consistency at 90 percent or above after five finalized records", () => {
    const result = evaluateAttendanceHealth([
      row("1", "2026-08-10", "Present"),
      row("2", "2026-08-11", "Present"),
      row("3", "2026-08-12", "Late"),
      row("4", "2026-08-13", "Present"),
      row("5", "2026-08-14", "Present"),
      row("6", "2026-08-15", "Present"),
      row("7", "2026-08-16", "Present"),
      row("8", "2026-08-17", "Present"),
      row("9", "2026-08-18", "Present"),
      row("10", "2026-08-19", "Absent"),
    ], { Absent: 1, Excused: 0 });
    expect(kinds(result)).toContain("consistency");
  });

  test("awards On Time for a five-class Present streak", () => {
    const result = evaluateAttendanceHealth([
      row("1", "2026-08-18", "Present"),
      row("2", "2026-08-19", "Present"),
      row("3", "2026-08-20", "Present"),
      row("4", "2026-08-21", "Present"),
      row("5", "2026-08-22", "Present"),
    ], { Absent: 0, Excused: 0 });
    expect(result.health.onTimeStreak).toBe(5);
    expect(kinds(result)).toContain("on_time");
  });

  test("awards Comeback from derived recovery and removes it when corrected history no longer has the prior late pattern", () => {
    const recovered = evaluateAttendanceHealth([
      row("l1", "2026-08-10", "Late"),
      row("l2", "2026-08-11", "Late"),
      row("l3", "2026-08-12", "Late"),
      row("p1", "2026-08-20", "Present"),
      row("p2", "2026-08-21", "Present"),
      row("p3", "2026-08-22", "Present"),
    ], { Absent: 0, Excused: 0 });
    expect(recovered.health.state).toBe("recovery");
    expect(kinds(recovered)).toContain("comeback");

    const corrected = evaluateAttendanceHealth([
      row("l1", "2026-08-10", "Present"),
      row("l2", "2026-08-11", "Present"),
      row("l3", "2026-08-12", "Present"),
      row("p1", "2026-08-20", "Present"),
      row("p2", "2026-08-21", "Present"),
      row("p3", "2026-08-22", "Present"),
    ], { Absent: 0, Excused: 0 });
    expect(corrected.health.state).toBe("healthy");
    expect(kinds(corrected)).not.toContain("comeback");
  });
});
