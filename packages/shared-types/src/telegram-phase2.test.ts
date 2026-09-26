import { describe, expect, test } from "bun:test";
import {
  TelegramAssessmentDeadlineDashboardSchema,
  TelegramLecturerWorkloadSchema,
  TelegramStudentAttendanceHistorySchema,
} from "./telegram-phase2.ts";

describe("Telegram phase 2 contracts", () => {
  test("accepts deadline dashboard payloads", () => {
    expect(TelegramAssessmentDeadlineDashboardSchema.safeParse({ assessments: [{
      offeringId: "offering-1",
      courseCode: "DSE301",
      courseTitle: "Machine Learning",
      sectionCode: "A",
      assessmentId: "assessment-1",
      name: "Project",
      dueAt: "2026-09-20T10:00:00.000Z",
      dueWeek: 6,
      weight: 30,
    }] }).success).toBe(true);
  });

  test("accepts attendance history while the official student number is pending", () => {
    expect(TelegramStudentAttendanceHistorySchema.safeParse({
      offeringId: "offering-1",
      studentId: "student-1",
      studentNumber: null,
      totalSessions: 1,
      markedSessions: 1,
      attendanceRate: 100,
      counts: {
        Present: 1,
        Absent: 0,
        Late: 0,
        Excused: 0,
        PermissionPending: 0,
      },
      health: {
        state: "healthy",
        attendanceStreak: 1,
        onTimeStreak: 1,
        consecutiveLate: 0,
        absencePermissionCount: 0,
        signals: [],
        message: "Keep building a consistent attendance routine.",
      },
      history: [{
        sessionId: "session-1",
        date: "2026-08-17",
        status: "Present",
        permissionPending: false,
        permissionPendingSince: null,
        note: "",
        updatedAt: "2026-08-17T10:00:00.000Z",
      }],
    }).success).toBe(true);
  });

  test("rejects invalid attendance percentages and statuses", () => {
    expect(TelegramStudentAttendanceHistorySchema.safeParse({
      offeringId: "offering-1",
      studentId: "student-1",
      studentNumber: "DSE001",
      totalSessions: 1,
      markedSessions: 1,
      attendanceRate: 120,
      counts: { Present: 1, Absent: 0, Late: 0, Excused: 0 },
      history: [{
        sessionId: "session-1",
        date: "2026-08-17",
        status: "Present",
        note: "",
        updatedAt: "2026-08-17T10:00:00.000Z",
      }],
    }).success).toBe(false);
  });

  test("accepts workload projection payloads", () => {
    expect(TelegramLecturerWorkloadSchema.safeParse({
      scheduledWeeklyHours: 2,
      peakWeeklyHours: 4,
      totalHours: 24,
      coLecturerAssumption: "full",
      scheduleRows: [{
        meetingId: "meeting-1",
        offeringId: "offering-1",
        course: { id: "course-1", code: "DSE301", title: "Machine Learning" },
        term: "2026-S1",
        sectionCode: "A",
        role: "Primary",
        dayOfWeek: "Monday",
        startTime: "08:00",
        endTime: "10:00",
        room: "301",
        activityType: "Lecture",
        durationHours: 2,
      }],
      weeklyTotals: [{ term: "2026-S1", week: 1, totalContactHours: 4 }],
    }).success).toBe(true);
  });
});
