import { describe, expect, test } from "bun:test";
import type {
  PortalCourseAchievementSummary,
  StudentAcademicCalendarView,
} from "@dse-pms/shared-types";
import {
  buildCourseAttendanceWeeks,
  teachingWeekForAttendanceDate,
} from "./course-attendance-progress";

const calendar: StudentAcademicCalendarView = {
  status: "available",
  academicYear: {
    id: "year-1",
    programmeId: "programme-1",
    label: "2026-2027",
    startYear: 2026,
    endYear: 2027,
    isCurrent: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  studyYear: 3,
  periods: [
    {
      id: "period-1",
      calendarId: "calendar-1",
      semester: "First",
      teachingStart: "2026-08-10",
      teachingEnd: "2026-12-06",
      examStart: "2026-12-07",
      examEnd: "2026-12-13",
      breakStart: "2026-10-05",
      breakEnd: "2026-10-11",
    },
  ],
  events: [],
  nextEvent: null,
};

function summary(
  sessions: PortalCourseAchievementSummary["attendance"]["sessions"],
): PortalCourseAchievementSummary {
  return {
    offeringId: "offering-1",
    eligibleAttendanceSessions: 0,
    achievementAttendanceRate: null,
    finalizedCourseGrade: null,
    attendance: {
      totalSessions: sessions.length,
      markedSessions: sessions.filter((session) => session.status !== null).length,
      attendanceRate: 90,
      sessions,
    },
    badges: [],
  };
}

describe("course attendance progress", () => {
  test("maps dates to teaching weeks without incrementing during the break", () => {
    const period = calendar.status === "available" ? calendar.periods[0]! : null;
    expect(period).not.toBeNull();
    expect(teachingWeekForAttendanceDate(period!, "2026-09-07")).toBe(5);
    expect(teachingWeekForAttendanceDate(period!, "2026-10-07")).toBeNull();
    expect(teachingWeekForAttendanceDate(period!, "2026-10-12")).toBe(9);
  });

  test("aggregates multiple sessions conservatively and keeps pending below finalized evidence", () => {
    const progress = buildCourseAttendanceWeeks({
      summary: summary([
        { date: "2026-08-10", status: "Present", permissionPending: false },
        { date: "2026-08-11", status: "Late", permissionPending: false },
        { date: "2026-08-17", status: "Present", permissionPending: false },
        { date: "2026-08-18", status: "Excused", permissionPending: false },
        { date: "2026-08-24", status: "Late", permissionPending: false },
        { date: "2026-08-25", status: "Absent", permissionPending: false },
        { date: "2026-08-31", status: null, permissionPending: true },
        { date: "2026-09-01", status: "Present", permissionPending: false },
        { date: "2026-09-07", status: null, permissionPending: true },
      ]),
      calendar,
      term: "2026-2027-S1",
      now: new Date(2026, 8, 9, 10, 0, 0),
    });

    expect(progress?.totalWeeks).toBe(16);
    expect(progress?.currentWeek).toBe(5);
    expect(progress?.weeks.slice(0, 5).map((week) => week.state)).toEqual([
      "late",
      "excused",
      "absent",
      "present",
      "pending",
    ]);
    expect(progress?.weeks[5]?.state).toBe("future");
  });

  test("uses the current academic-year term when no attendance sessions exist", () => {
    const progress = buildCourseAttendanceWeeks({
      summary: summary([]),
      calendar,
      term: "2026-2027-S1",
      now: new Date(2026, 8, 9, 10, 0, 0),
    });

    expect(progress?.totalWeeks).toBe(16);
    expect(progress?.currentWeek).toBe(5);
    expect(progress?.weeks[0]?.state).toBe("not-recorded");
    expect(progress?.weeks[5]?.state).toBe("future");
  });

  test("marks a later semester as future even while the current semester is teaching", () => {
    if (calendar.status !== "available") throw new Error("calendar fixture unavailable");
    const fullYearCalendar: StudentAcademicCalendarView = {
      ...calendar,
      periods: [
        ...calendar.periods,
        {
          id: "period-2",
          calendarId: "calendar-1",
          semester: "Second",
          teachingStart: "2027-01-18",
          teachingEnd: "2027-05-09",
          examStart: "2027-05-10",
          examEnd: "2027-05-16",
          breakStart: null,
          breakEnd: null,
        },
      ],
    };

    const progress = buildCourseAttendanceWeeks({
      summary: summary([]),
      calendar: fullYearCalendar,
      term: "2026-2027-S2",
      now: new Date(2026, 8, 9, 10, 0, 0),
    });

    expect(progress?.currentWeek).toBeNull();
    expect(progress?.weeks.every((week) => week.state === "future")).toBe(true);
  });

  test("does not invent week mapping for a historical academic year absent from the published calendar", () => {
    const progress = buildCourseAttendanceWeeks({
      summary: summary([]),
      calendar,
      term: "2025-2026-S1",
      now: new Date(2026, 8, 9, 10, 0, 0),
    });

    expect(progress).toBeNull();
  });
});
