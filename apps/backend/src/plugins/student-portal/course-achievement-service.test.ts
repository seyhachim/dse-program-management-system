import { describe, expect, test } from "bun:test";
import type { AttendanceStatus } from "@dse-pms/shared-types";
import { deriveCourseAchievementSummary } from "./course-achievement-service.ts";

type Counts = Record<AttendanceStatus, number> & { PermissionPending: number };

function counts(overrides: Partial<Counts> = {}): Counts {
  return {
    Present: 0,
    Late: 0,
    Absent: 0,
    Excused: 0,
    PermissionPending: 0,
    ...overrides,
  };
}

function achieved(
  result: ReturnType<typeof deriveCourseAchievementSummary>,
  kind: ReturnType<typeof deriveCourseAchievementSummary>["badges"][number]["kind"],
) {
  return result.badges.find((item) => item.kind === kind)?.achieved ?? false;
}

describe("Student Portal course achievement badges", () => {
  test("publishes the stable five v1 badge labels in milestone order", () => {
    const result = deriveCourseAchievementSummary({ offeringId: "offering-1" });

    expect(result.badges.map(({ kind, title }) => ({ kind, title }))).toEqual([
      { kind: "great_start", title: "Great Start" },
      { kind: "reliable_learner", title: "Reliable Learner" },
      { kind: "perfect_attendance", title: "Perfect Attendance" },
      { kind: "strong_performance", title: "Strong Performance" },
      { kind: "course_excellence", title: "Course Excellence" },
    ]);
    expect(result.attendance).toEqual({
      totalSessions: 0,
      markedSessions: 0,
      attendanceRate: null,
      sessions: [],
    });
  });

  test("Late counts as attendance while Excused is excluded from the motivational denominator", () => {
    const result = deriveCourseAchievementSummary({
      offeringId: "offering-1",
      counts: counts({ Present: 3, Late: 2, Excused: 4 }),
    });

    expect(result.eligibleAttendanceSessions).toBe(5);
    expect(result.achievementAttendanceRate).toBe(100);
    expect(achieved(result, "great_start")).toBe(true);
    expect(achieved(result, "reliable_learner")).toBe(true);
  });

  test("keeps canonical attendance rate separate from motivational badge rate", () => {
    const result = deriveCourseAchievementSummary({
      offeringId: "offering-1",
      counts: counts({ Present: 3, Late: 1, Excused: 1 }),
      attendance: {
        totalSessions: 5,
        markedSessions: 5,
        attendanceRate: 80,
        sessions: [
          { date: "2026-08-10", status: "Present", permissionPending: false },
          { date: "2026-08-17", status: "Late", permissionPending: false },
          { date: "2026-08-24", status: "Excused", permissionPending: false },
        ],
      },
    });

    expect(result.achievementAttendanceRate).toBe(100);
    expect(result.attendance.attendanceRate).toBe(80);
    expect(result.attendance.sessions[1]?.status).toBe("Late");
  });

  test("Absent counts against the badge rate and keeps Reliable Learner locked below 90 percent", () => {
    const result = deriveCourseAchievementSummary({
      offeringId: "offering-1",
      counts: counts({ Present: 4, Absent: 1 }),
    });

    expect(result.achievementAttendanceRate).toBe(80);
    expect(achieved(result, "great_start")).toBe(false);
    expect(achieved(result, "reliable_learner")).toBe(false);
  });

  test("Perfect Attendance requires ten eligible attended classes", () => {
    const nine = deriveCourseAchievementSummary({
      offeringId: "offering-1",
      counts: counts({ Present: 8, Late: 1 }),
    });
    const ten = deriveCourseAchievementSummary({
      offeringId: "offering-1",
      counts: counts({ Present: 8, Late: 2, Excused: 1 }),
    });

    expect(achieved(nine, "perfect_attendance")).toBe(false);
    expect(achieved(ten, "perfect_attendance")).toBe(true);
  });

  test("Strong Performance requires a complete finalized course grade of at least 85", () => {
    const incomplete = deriveCourseAchievementSummary({
      offeringId: "offering-1",
      finalizedGrade: { complete: false, totalGrade: 92 },
    });
    const below = deriveCourseAchievementSummary({
      offeringId: "offering-1",
      finalizedGrade: { complete: true, totalGrade: 84.99 },
    });
    const strong = deriveCourseAchievementSummary({
      offeringId: "offering-1",
      finalizedGrade: { complete: true, totalGrade: 85 },
    });

    expect(achieved(incomplete, "strong_performance")).toBe(false);
    expect(incomplete.finalizedCourseGrade).toBeNull();
    expect(achieved(below, "strong_performance")).toBe(false);
    expect(achieved(strong, "strong_performance")).toBe(true);
  });

  test("Course Excellence requires both reliable attendance and strong finalized performance", () => {
    const performanceOnly = deriveCourseAchievementSummary({
      offeringId: "offering-1",
      counts: counts({ Present: 4, Absent: 1 }),
      finalizedGrade: { complete: true, totalGrade: 90 },
    });
    const excellence = deriveCourseAchievementSummary({
      offeringId: "offering-1",
      counts: counts({ Present: 4, Late: 1, Excused: 2 }),
      finalizedGrade: { complete: true, totalGrade: 90 },
    });

    expect(achieved(performanceOnly, "course_excellence")).toBe(false);
    expect(achieved(excellence, "course_excellence")).toBe(true);
  });
});
