import { describe, expect, test } from "bun:test";
import { toPortalStudentAttendanceHistory } from "./student-attendance-service.ts";

describe("Student Portal attendance projection", () => {
  test("keeps canonical attendance semantics but strips private record detail", () => {
    const result = toPortalStudentAttendanceHistory({
      offeringId: "offering-1",
      totalSessions: 3,
      markedSessions: 2,
      attendanceRate: 50,
      counts: {
        Present: 1,
        Absent: 1,
        Late: 0,
        Excused: 0,
        PermissionPending: 1,
      },
      history: [
        {
          sessionId: "session-private-id",
          date: "2026-09-08",
          status: "Present",
          permissionPending: false,
          permissionPendingSince: null,
          note: "private staff note",
          updatedAt: "2026-09-08T08:00:00.000Z",
        },
      ],
    });

    expect(result.attendanceRate).toBe(50);
    expect(result.counts).toEqual({
      Present: 1,
      Absent: 1,
      Late: 0,
      Excused: 0,
      PermissionPending: 1,
    });
    expect(result.history).toEqual([
      {
        date: "2026-09-08",
        status: "Present",
        permissionPending: false,
        updatedAt: "2026-09-08T08:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("private staff note");
    expect(JSON.stringify(result)).not.toContain("session-private-id");
    expect(JSON.stringify(result)).not.toContain("permissionPendingSince");
  });
});
