import { describe, expect, test } from "bun:test";
import {
  buildTeachingWeekDateOptions,
  formatMeetingTime,
  formatTeachingWeekRange,
  isMeetingInProgress,
  isPortalMeetingScheduledOnDate,
  normalizeTeachingDate,
  parseLocalDateKey,
  teachingWeekStart,
  toLocalDateKey,
} from "./portal-schedule-utils";

describe("Student Portal schedule helpers", () => {
  test("builds a fixed Monday through Saturday teaching week", () => {
    const options = buildTeachingWeekDateOptions(new Date(2026, 8, 9));

    expect(options).toHaveLength(6);
    expect(options.map((option) => option.weekdayLong)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
    expect(options.map((option) => option.key)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
    expect(formatTeachingWeekRange(options)).toBe("7–12 Sep");
  });

  test("normalizes Sunday to the next teaching Monday", () => {
    const sunday = new Date(2026, 8, 13);
    expect(toLocalDateKey(normalizeTeachingDate(sunday))).toBe("2026-09-14");
    expect(toLocalDateKey(teachingWeekStart(sunday))).toBe("2026-09-14");
  });

  test("moves to the correct Monday-Saturday week for a selected date", () => {
    const options = buildTeachingWeekDateOptions(new Date(2026, 8, 22));
    expect(options[0]?.key).toBe("2026-09-21");
    expect(options.at(-1)?.key).toBe("2026-09-26");
  });

  test("round-trips local date input values without UTC shifting", () => {
    const parsed = parseLocalDateKey("2026-09-08");
    expect(parsed).not.toBeNull();
    expect(toLocalDateKey(parsed!)).toBe("2026-09-08");
    expect(parseLocalDateKey("2026-02-31")).toBeNull();
  });

  test("detects only an in-progress meeting on the selected current date", () => {
    const selectedDate = new Date(2026, 8, 8);

    expect(
      isMeetingInProgress(
        selectedDate,
        new Date(2026, 8, 8, 10, 45),
        "10:30",
        "12:00",
      ),
    ).toBe(true);
    expect(
      isMeetingInProgress(
        selectedDate,
        new Date(2026, 8, 8, 12, 0),
        "10:30",
        "12:00",
      ),
    ).toBe(false);
    expect(
      isMeetingInProgress(
        selectedDate,
        new Date(2026, 8, 9, 10, 45),
        "10:30",
        "12:00",
      ),
    ).toBe(false);
  });

  test("projects current and planned meetings only on matching weekdays within inclusive teaching dates", () => {
    const period = { teachingStartDate: "2026-09-07", teachingEndDate: "2026-12-12" };
    expect(isPortalMeetingScheduledOnDate(period, "Monday", "2026-09-07", "Monday")).toBe(true);
    expect(isPortalMeetingScheduledOnDate(period, "Saturday", "2026-12-12", "Saturday")).toBe(true);
    expect(isPortalMeetingScheduledOnDate(period, "Monday", "2026-09-14", "Tuesday")).toBe(false);
    expect(isPortalMeetingScheduledOnDate(period, "Monday", "2026-09-06", "Monday")).toBe(false);
    expect(isPortalMeetingScheduledOnDate(period, "Monday", "2026-12-14", "Monday")).toBe(false);
  });

  test("keeps historical meetings in their own dates but suppresses them in a later year", () => {
    const historical = { teachingStartDate: "2025-09-01", teachingEndDate: "2025-12-20" };
    expect(isPortalMeetingScheduledOnDate(historical, "Monday", "2025-09-08", "Monday")).toBe(true);
    expect(isPortalMeetingScheduledOnDate(historical, "Monday", "2026-09-07", "Monday")).toBe(false);
  });

  test("does not project undated or partially dated offerings", () => {
    for (const period of [
      { teachingStartDate: null, teachingEndDate: null },
      { teachingStartDate: "2025-09-01", teachingEndDate: null },
      { teachingStartDate: null, teachingEndDate: "2025-12-20" },
    ]) {
      expect(isPortalMeetingScheduledOnDate(period, "Monday", "2026-09-07", "Monday")).toBe(false);
    }
  });

  test("formats 24-hour meeting times for the mobile timetable", () => {
    expect(formatMeetingTime("08:30")).toBe("8:30 AM");
    expect(formatMeetingTime("12:15")).toBe("12:15 PM");
    expect(formatMeetingTime("18:05")).toBe("6:05 PM");
  });
});
