import { describe, expect, test } from "bun:test";
import type { StudentAcademicCalendarView } from "@dse-pms/shared-types";
import {
  teachingWeekForDate,
  toPortalWeeklyNotes,
} from "./weekly-notes-service.ts";

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
      teachingStart: "2026-09-07",
      teachingEnd: "2026-12-27",
      examStart: null,
      examEnd: null,
      breakStart: "2026-09-21",
      breakEnd: "2026-09-27",
    },
  ],
  events: [],
  nextEvent: null,
};

describe("Student Portal weekly notes", () => {
  test("derives teaching week from published calendar while pausing across breaks", () => {
    expect(teachingWeekForDate(calendar.periods, "2026-09-07")).toBe(1);
    expect(teachingWeekForDate(calendar.periods, "2026-09-14")).toBe(2);
    expect(teachingWeekForDate(calendar.periods, "2026-09-24")).toBeNull();
    expect(teachingWeekForDate(calendar.periods, "2026-09-28")).toBe(3);
  });

  test("projects only student-safe delivery fields", () => {
    const result = toPortalWeeklyNotes(
      "offering-1",
      [
        {
          date: "2026-09-14",
          classHeld: true,
          lecturerName: "Chim Seyha",
          topic: "Introduction to time series",
          learningSummary: "Recognised ordered observations and time dependence.",
        },
      ],
      calendar,
      new Date("2026-09-14T01:00:00.000Z"),
    );

    expect(result.currentWeek).toBe(2);
    expect(result.entries).toEqual([
      {
        week: 2,
        date: "2026-09-14",
        classHeld: true,
        lecturerName: "Chim Seyha",
        topic: "Introduction to time series",
        learningSummary: "Recognised ordered observations and time dependence.",
      },
    ]);
    expect(Object.keys(result.entries[0]!).sort()).toEqual(
      ["classHeld", "date", "learningSummary", "lecturerName", "topic", "week"].sort(),
    );
  });

  test("does not fabricate a week when published calendar context is unavailable", () => {
    const unavailable: StudentAcademicCalendarView = {
      status: "unavailable",
      academicYear: null,
      studyYear: null,
      reason: "academic-year-unavailable",
      message: "No current academic year is configured for your programme.",
    };
    const result = toPortalWeeklyNotes(
      "offering-1",
      [
        {
          date: "2026-09-14",
          classHeld: false,
          lecturerName: null,
          topic: "",
          learningSummary: "",
        },
      ],
      unavailable,
      new Date("2026-09-14T01:00:00.000Z"),
    );

    expect(result.currentWeek).toBeNull();
    expect(result.entries[0]?.week).toBeNull();
  });
});
