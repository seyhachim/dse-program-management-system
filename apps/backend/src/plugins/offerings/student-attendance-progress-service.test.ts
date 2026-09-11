import { describe, expect, test } from "bun:test";
import { summarizeStudentAttendanceProgress } from "./student-attendance-progress-service.ts";

describe("student attendance progress projection", () => {
  test("keeps canonical attendance semantics and returns only safe session state", () => {
    const result = summarizeStudentAttendanceProgress(
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

    expect(result).toEqual([
      {
        offeringId: "offering-1",
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
        sessions: [
          { date: "2026-08-10", status: "Present", permissionPending: false },
          { date: "2026-08-17", status: "Late", permissionPending: false },
          { date: "2026-08-24", status: "Absent", permissionPending: false },
          { date: "2026-08-31", status: "Excused", permissionPending: false },
          { date: "2026-09-07", status: null, permissionPending: true },
        ],
      },
    ]);
  });

  test("returns empty summaries for enrolled offerings with no attendance sessions", () => {
    expect(
      summarizeStudentAttendanceProgress(["offering-1", "offering-2"], [], [], []),
    ).toEqual([
      {
        offeringId: "offering-1",
        totalSessions: 0,
        markedSessions: 0,
        attendanceRate: null,
        counts: {
          Present: 0,
          Absent: 0,
          Late: 0,
          Excused: 0,
          PermissionPending: 0,
        },
        sessions: [],
      },
      {
        offeringId: "offering-2",
        totalSessions: 0,
        markedSessions: 0,
        attendanceRate: null,
        counts: {
          Present: 0,
          Absent: 0,
          Late: 0,
          Excused: 0,
          PermissionPending: 0,
        },
        sessions: [],
      },
    ]);
  });
});
