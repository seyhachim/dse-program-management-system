import { describe, expect, test } from "bun:test";
import { summarizeStudentAttendanceHealthByOffering } from "./student-attendance-history-service.ts";

describe("batched student attendance health summary", () => {
  test("preserves canonical counts, pending precedence, rates, and health per offering", () => {
    const summaries = summarizeStudentAttendanceHealthByOffering(
      ["offering-a", "offering-b", "offering-a"],
      [
        { id: "a4", offeringId: "offering-a", sessionDate: new Date("2026-09-04T00:00:00.000Z") },
        { id: "a3", offeringId: "offering-a", sessionDate: new Date("2026-09-03T00:00:00.000Z") },
        { id: "a2", offeringId: "offering-a", sessionDate: new Date("2026-09-02T00:00:00.000Z") },
        { id: "a1", offeringId: "offering-a", sessionDate: new Date("2026-09-01T00:00:00.000Z") },
        { id: "b2", offeringId: "offering-b", sessionDate: new Date("2026-09-02T00:00:00.000Z") },
        { id: "b1", offeringId: "offering-b", sessionDate: new Date("2026-09-01T00:00:00.000Z") },
      ],
      [
        { sessionId: "a4", status: "Late" },
        { sessionId: "a3", status: "Late" },
        { sessionId: "a2", status: "Late" },
        { sessionId: "a1", status: "Present" },
        { sessionId: "b1", status: "Present" },
      ],
      [
        { sessionId: "b1" },
        { sessionId: "b2" },
      ],
    );

    expect(summaries).toHaveLength(2);

    const first = summaries.find((summary) => summary.offeringId === "offering-a");
    expect(first?.history).toEqual({
      totalSessions: 4,
      markedSessions: 4,
      attendanceRate: 100,
      counts: { Present: 1, Absent: 0, Late: 3, Excused: 0, PermissionPending: 0 },
    });
    expect(first?.health.state).toBe("warning");
    expect(first?.health.signals).toContainEqual(
      expect.objectContaining({ kind: "punctuality", level: "warning", count: 3 }),
    );

    const second = summaries.find((summary) => summary.offeringId === "offering-b");
    expect(second?.history).toEqual({
      totalSessions: 2,
      markedSessions: 1,
      attendanceRate: 100,
      counts: { Present: 1, Absent: 0, Late: 0, Excused: 0, PermissionPending: 1 },
    });
    expect(second?.health.state).toBe("healthy");
  });

  test("returns an empty healthy aggregate for an offering with no sessions", () => {
    expect(summarizeStudentAttendanceHealthByOffering(["offering-empty"], [], [], [])).toEqual([
      expect.objectContaining({
        offeringId: "offering-empty",
        history: {
          totalSessions: 0,
          markedSessions: 0,
          attendanceRate: null,
          counts: { Present: 0, Absent: 0, Late: 0, Excused: 0, PermissionPending: 0 },
        },
        health: expect.objectContaining({ state: "healthy" }),
      }),
    ]);
  });
});
