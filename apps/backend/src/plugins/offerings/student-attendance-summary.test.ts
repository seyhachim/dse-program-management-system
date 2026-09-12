import { describe, expect, test } from "bun:test";
import { summarizeStudentAttendanceHealthByOffering } from "./student-attendance-history-service.ts";

describe("student bulk attendance summary", () => {
  test("keeps canonical attendance semantics and exposes only safe session state", () => {
    const result = summarizeStudentAttendanceHealthByOffering(
      ["offering-1"],
      [
        { id: "s1", offeringId: "offering-1", sessionDate: new Date("2026-08-10T00:00:00.000Z") },
        { id: "s2", offeringId: "offering-1", sessionDate: new Date("2026-08-17T00:00:00.000Z") },
        { id: "s3", offeringId: "offering-1", sessionDate: new Date("2026-08-24T00:00:00.000Z") },
        { id: "s4", offeringId: "offering-1", sessionDate: new Date("2026-08-31T00:00:00.000Z") },
        { id: "s5", offeringId: "offering-1", sessionDate: new Date("2026-09-07T00:00:00.000Z") },
      ],
      [
        { sessionId: "s1", status: "Present" },
        { sessionId: "s2", status: "Late" },
        { sessionId: "s3", status: "Absent" },
        { sessionId: "s4", status: "Excused" },
      ],
      [{ sessionId: "s5" }],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.offeringId).toBe("offering-1");
    expect(result[0]?.history).toEqual({
      totalSessions: 5,
      markedSessions: 4,
      attendanceRate: 50,
      counts: {
        Present: 1,
        Absent: 1,
        Late: 1,
        Excused: 1,
        PermissionPending: 1,
      },
    });
    expect(result[0]?.sessions).toEqual([
      { date: "2026-08-10", status: "Present", permissionPending: false },
      { date: "2026-08-17", status: "Late", permissionPending: false },
      { date: "2026-08-24", status: "Absent", permissionPending: false },
      { date: "2026-08-31", status: "Excused", permissionPending: false },
      { date: "2026-09-07", status: null, permissionPending: true },
    ]);
    expect(Object.keys(result[0]?.sessions[0] ?? {}).sort()).toEqual([
      "date",
      "permissionPending",
      "status",
    ]);
  });

  test("returns enrolled offering summaries even when no attendance sessions exist", () => {
    const result = summarizeStudentAttendanceHealthByOffering(
      ["offering-1", "offering-2"],
      [],
      [],
      [],
    );

    expect(result.map((item) => item.offeringId)).toEqual([
      "offering-1",
      "offering-2",
    ]);
    for (const item of result) {
      expect(item.history.totalSessions).toBe(0);
      expect(item.history.markedSessions).toBe(0);
      expect(item.history.attendanceRate).toBeNull();
      expect(item.sessions).toEqual([]);
    }
  });
});
