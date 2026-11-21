import { describe, expect, test } from "bun:test";
import type { StudentAcademicCalendarView } from "@dse-pms/shared-types";
import {
  buildKhmerLunarMonthCells,
  cambodiaTodayDateKey,
  formatGregorianCalendarDate,
  khmerLunarDisplay,
  monthHeading,
  publishedItemsOnDate,
  shiftCalendarMonth,
} from "./khmer-lunar-calendar";

type AvailableCalendar = Extract<StudentAcademicCalendarView, { status: "available" }>;

const published: AvailableCalendar = {
  status: "available",
  academicYear: {
    id: "year-2026",
    programmeId: "dse",
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
      teachingStart: "2026-11-01",
      teachingEnd: "2026-11-30",
      examStart: "2026-12-01",
      examEnd: "2026-12-07",
      breakStart: "2026-11-18",
      breakEnd: "2026-11-19",
    },
  ],
  events: [
    {
      id: "event-1",
      sortOrder: 1,
      calendarId: "calendar-1",
      title: "Official programme event",
      type: "Other",
      semester: "First",
      startDate: "2026-11-21",
      endDate: null,
      note: null,
    },
  ],
  nextEvent: null,
} as AvailableCalendar;

describe("Khmer lunar date display", () => {
  test("matches a verified Khmer lunar date in November 2026", () => {
    expect(khmerLunarDisplay("2026-11-21")).toMatchObject({
      short: "១២កើត",
      month: "កត្តិក",
      buddhistEraYear: 2570,
      moonPhase: "កើត",
    });
    expect(khmerLunarDisplay("2026-11-21").full).toContain("ព.ស. ២៥៧០");
  });

  test("handles the two Asadha months in the Khmer leap-month year", () => {
    expect(khmerLunarDisplay("2026-07-03").month).toBe("បឋមាសាឍ");
    expect(khmerLunarDisplay("2026-07-16").month).toBe("ទុតិយាសាឍ");
  });

  test("respects the Buddhist Era year boundary", () => {
    expect(khmerLunarDisplay("2026-05-01").buddhistEraYear).toBe(2569);
    expect(khmerLunarDisplay("2026-05-02").buddhistEraYear).toBe(2570);
  });
});

describe("calendar month grid", () => {
  test("starts on Monday and fills complete weeks across Gregorian month boundaries", () => {
    const cells = buildKhmerLunarMonthCells(2026, 11);
    expect(cells).toHaveLength(42);
    expect(cells[0]).toMatchObject({ dateKey: "2026-10-26", inMonth: false });
    expect(cells.at(-1)).toMatchObject({ dateKey: "2026-12-06", inMonth: false });
    expect(cells.find((cell) => cell.dateKey === "2026-11-21")).toMatchObject({
      day: 21, inMonth: true, lunar: { short: "១២កើត", month: "កត្តិក" },
    });
  });

  test("supports a four-week February, leap-day Gregorian year and oldest supported date", () => {
    expect(buildKhmerLunarMonthCells(2027, 2)).toHaveLength(28);
    expect(buildKhmerLunarMonthCells(2028, 2).some((cell) => cell.dateKey === "2028-02-29")).toBe(true);
    const oldest = buildKhmerLunarMonthCells(1900, 1);
    expect(oldest[0]?.dateKey).toBe("1900-01-01");
    expect(() => buildKhmerLunarMonthCells(1899, 12)).toThrow();
  });

  test("navigates Dec/Jan and formats using stable UTC civil dates", () => {
    expect(shiftCalendarMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftCalendarMonth(2027, 1, -1)).toEqual({ year: 2026, month: 12 });
    expect(monthHeading(2026, 11)).toBe("November 2026");
    expect(formatGregorianCalendarDate("2026-11-21")).toBe("Saturday, 21 November 2026");
  });
});

describe("Cambodia date and publication boundary", () => {
  test("uses Phnom Penh time at midnight rather than device-local time", () => {
    expect(cambodiaTodayDateKey(new Date("2026-11-20T16:59:59Z"))).toBe("2026-11-20");
    expect(cambodiaTodayDateKey(new Date("2026-11-20T17:00:00Z"))).toBe("2026-11-21");
  });

  test("projects only the supplied published student's events and intervals", () => {
    expect(publishedItemsOnDate(published, "2026-11-21").map((item) => item.title)).toEqual([
      "Semester 1 teaching period",
      "Official programme event",
    ]);
    expect(publishedItemsOnDate(published, "2026-11-19").some((item) => item.kind === "break")).toBe(true);
    expect(publishedItemsOnDate(published, "2026-12-02").map((item) => item.kind)).toEqual(["exam"]);
    expect(publishedItemsOnDate(published, "2027-01-01")).toEqual([]);
  });
});
