import { describe, expect, test } from "bun:test";
import type { StudentAcademicCalendarView } from "@dse-pms/shared-types";
import {
  formatAcademicShortDateRange,
  resolveStudentTeachingContext,
} from "./academic-calendar";

function calendarWithPeriods(
  periods: StudentAcademicCalendarView extends { status: "available"; periods: infer T }
    ? T
    : never,
): StudentAcademicCalendarView {
  return {
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
    periods,
    events: [],
    nextEvent: null,
  };
}

const firstSemester = {
  id: "period-1",
  calendarId: "calendar-1",
  semester: "First" as const,
  teachingStart: "2026-08-10",
  teachingEnd: "2026-12-06",
  examStart: "2026-12-07",
  examEnd: "2026-12-13",
  breakStart: "2026-10-05",
  breakEnd: "2026-10-11",
};

describe("student teaching-week context", () => {
  test("derives the current teaching week from published period dates", () => {
    const context = resolveStudentTeachingContext(
      calendarWithPeriods([firstSemester]),
      new Date(2026, 8, 9, 10, 0, 0),
    );

    expect(context).toEqual({
      kind: "teaching",
      semester: "First",
      week: 5,
      totalWeeks: 16,
      startDate: "2026-09-07",
      endDate: "2026-09-13",
    });
    expect(formatAcademicShortDateRange("2026-09-07", "2026-09-13")).toBe(
      "7–13 Sep",
    );
  });

  test("holds the teaching-week counter during an explicit semester break", () => {
    const context = resolveStudentTeachingContext(
      calendarWithPeriods([firstSemester]),
      new Date(2026, 9, 7, 10, 0, 0),
    );

    expect(context).toEqual({
      kind: "break",
      semester: "First",
      nextWeek: 9,
      totalWeeks: 16,
      resumeDate: "2026-10-12",
    });
  });

  test("reports the next semester between teaching periods", () => {
    const secondSemester = {
      ...firstSemester,
      id: "period-2",
      semester: "Second" as const,
      teachingStart: "2027-01-11",
      teachingEnd: "2027-04-30",
      examStart: "2027-05-03",
      examEnd: "2027-05-09",
      breakStart: null,
      breakEnd: null,
    };
    const context = resolveStudentTeachingContext(
      calendarWithPeriods([firstSemester, secondSemester]),
      new Date(2026, 11, 20, 10, 0, 0),
    );

    expect(context).toEqual({
      kind: "between",
      nextSemester: "Second",
      resumeDate: "2027-01-11",
    });
  });

  test("returns no teaching context when the published calendar is unavailable", () => {
    const unavailable: StudentAcademicCalendarView = {
      status: "unavailable",
      academicYear: null,
      studyYear: null,
      reason: "calendar-unpublished",
      message: "Calendar not issued yet",
    };

    expect(resolveStudentTeachingContext(unavailable)).toBeNull();
  });
});
