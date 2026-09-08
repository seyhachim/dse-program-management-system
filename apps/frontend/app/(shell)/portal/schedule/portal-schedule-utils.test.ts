import { describe, expect, test } from "bun:test";
import {
  buildScheduleDateOptions,
  formatMeetingTime,
  isMeetingInProgress,
  parseLocalDateKey,
  toLocalDateKey,
} from "./portal-schedule-utils";

describe("Student Portal daily schedule helpers", () => {
  test("builds five nearby calendar dates around the selected day", () => {
    const options = buildScheduleDateOptions(new Date(2026, 8, 8));

    expect(options).toHaveLength(5);
    expect(options.map((option) => option.key)).toEqual([
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
    ]);
    expect(options[2]?.weekdayLong).toBe("Tuesday");
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

  test("formats 24-hour meeting times for the mobile timetable", () => {
    expect(formatMeetingTime("08:30")).toBe("8:30 AM");
    expect(formatMeetingTime("12:15")).toBe("12:15 PM");
    expect(formatMeetingTime("18:05")).toBe("6:05 PM");
  });
});
