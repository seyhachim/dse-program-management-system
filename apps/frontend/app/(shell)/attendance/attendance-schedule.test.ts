import { describe, expect, test } from "bun:test";
import type { OfferingView } from "@dse-pms/shared-types";
import {
  isOfferingScheduledOnDate,
  meetingDayForDate,
  offeringsScheduledOnDate,
} from "./attendance-schedule";

function offering(overrides: Partial<OfferingView> = {}): OfferingView {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    term: "2026-2027-S1",
    sectionCode: "M1",
    status: "Active",
    capacity: 50,
    enrolledCount: 45,
    createdAt: "2026-09-01T00:00:00.000Z",
    semester: "First",
    programmeYear: 3,
    academicCalendarPeriodId: "22222222-2222-4222-8222-222222222222",
    academicCalendar: null,
    startDate: "2026-09-07",
    endDate: "2026-12-31",
    otherLecturers: null,
    meetings: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        dayOfWeek: "Monday",
        startTime: "07:30",
        endTime: "11:30",
        building: "STEM Building",
        room: null,
        activityType: "Lecture",
        durationHours: 4,
      },
    ],
    course: {
      id: "44444444-4444-4444-8444-444444444444",
      code: "TSA301",
      title: "Time Series Analysis",
      programmeId: "55555555-5555-4555-8555-555555555555",
    },
    courseSpec: null,
    lecturer: null,
    coLecturers: [],
    students: [],
    ...overrides,
  };
}

describe("attendance date schedule", () => {
  test("resolves a date to the timetable weekday without timezone drift", () => {
    expect(meetingDayForDate("2026-09-14")).toBe("Monday");
    expect(meetingDayForDate("2026-09-16")).toBe("Wednesday");
    expect(meetingDayForDate("2026-02-30")).toBeNull();
    expect(meetingDayForDate("2026-9-14")).toBeNull();
  });

  test("matches a recurring class only inside its effective teaching period", () => {
    const tsa = offering();
    expect(isOfferingScheduledOnDate(tsa, "2026-09-14")).toBe(true);
    expect(isOfferingScheduledOnDate(tsa, "2026-09-16")).toBe(false);
    expect(isOfferingScheduledOnDate(tsa, "2026-09-06")).toBe(false);
    expect(isOfferingScheduledOnDate(tsa, "2027-01-04")).toBe(false);
  });

  test("keeps completed classes available on matching historical dates but excludes planned delivery", () => {
    expect(
      isOfferingScheduledOnDate(offering({ status: "Completed" }), "2026-09-14"),
    ).toBe(true);
    expect(
      isOfferingScheduledOnDate(offering({ status: "Planned" }), "2026-09-14"),
    ).toBe(false);
  });

  test("requires effective teaching dates and a matching timetable meeting", () => {
    expect(isOfferingScheduledOnDate(offering({ startDate: null }), "2026-09-14")).toBe(false);
    expect(isOfferingScheduledOnDate(offering({ endDate: null }), "2026-09-14")).toBe(false);
    expect(isOfferingScheduledOnDate(offering({ meetings: [] }), "2026-09-14")).toBe(false);
  });

  test("returns only the lecturer classes scheduled on the selected date", () => {
    const mondayM1 = offering({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const mondayM2 = offering({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      sectionCode: "M2",
    });
    const wednesdayDss = offering({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      course: {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        code: "DSS301",
        title: "Data Science for Smart Agriculture",
        programmeId: "55555555-5555-4555-8555-555555555555",
      },
      meetings: [
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          dayOfWeek: "Wednesday",
          startTime: "07:30",
          endTime: "11:30",
          building: "STEM Building",
          room: null,
          activityType: "Lecture",
          durationHours: 4,
        },
      ],
    });

    expect(
      offeringsScheduledOnDate([mondayM1, mondayM2, wednesdayDss], "2026-09-14").map(
        (item) => item.id,
      ),
    ).toEqual([mondayM1.id, mondayM2.id]);
  });
});
