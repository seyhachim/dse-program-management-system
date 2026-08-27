import { describe, expect, test } from "bun:test";
import type { AcademicCalendarEventView } from "@dse-pms/shared-types";
import { groupPublicAcademicCalendarEvents } from "./public-academic-calendar-events";

function event(
  id: string,
  semester: AcademicCalendarEventView["semester"],
  title: string,
): AcademicCalendarEventView {
  return {
    id,
    title,
    type: "Other",
    semester,
    startDate: "2027-06-14",
    endDate: "2027-06-18",
    note: "",
    sortOrder: 0,
  } as AcademicCalendarEventView;
}

describe("groupPublicAcademicCalendarEvents", () => {
  test("places semester-scoped events in the matching semester group", () => {
    const first = event("first", "First", "Project proposal week");
    const second = event("second", "Second", "Defense week");

    const grouped = groupPublicAcademicCalendarEvents([first, second]);

    expect(grouped.First).toEqual([first]);
    expect(grouped.Second).toEqual([second]);
    expect(grouped.unscoped).toEqual([]);
  });

  test("keeps programme-wide and unscoped events outside semester cards", () => {
    const holiday = event("holiday", null, "Public holiday");
    const defense = event("defense", "Second", "Defense week");

    const grouped = groupPublicAcademicCalendarEvents([holiday, defense]);

    expect(grouped.First).toEqual([]);
    expect(grouped.Second).toEqual([defense]);
    expect(grouped.unscoped).toEqual([holiday]);
  });

  test("does not duplicate semester-scoped events in the unscoped group", () => {
    const defense = event("defense", "Second", "Defense week");

    const grouped = groupPublicAcademicCalendarEvents([defense]);

    expect(grouped.Second).toHaveLength(1);
    expect(grouped.unscoped).toHaveLength(0);
  });
});
