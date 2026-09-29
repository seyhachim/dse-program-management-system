import { describe, expect, test } from "bun:test";
import { portalOfferingTeachingPeriod } from "./service.ts";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("student portal Offering teaching period projection", () => {
  test("uses the pinned Academic Calendar period before legacy snapshots", () => {
    expect(portalOfferingTeachingPeriod({
      academicCalendarPeriod: { teachingStart: date("2026-09-07"), teachingEnd: date("2026-12-12") },
      startDate: date("2025-09-01"),
      endDate: date("2025-12-20"),
    })).toEqual({ startDate: "2026-09-07", endDate: "2026-12-12" });
  });

  test("uses complete legacy snapshots for historical offerings", () => {
    expect(portalOfferingTeachingPeriod({
      academicCalendarPeriod: null,
      startDate: date("2025-09-01"),
      endDate: date("2025-12-20"),
    })).toEqual({ startDate: "2025-09-01", endDate: "2025-12-20" });
  });

  test("fails closed for undated, partial, or inverted periods", () => {
    for (const [startDate, endDate] of [
      [null, null],
      [date("2025-09-01"), null],
      [null, date("2025-12-20")],
      [date("2025-12-20"), date("2025-09-01")],
    ] as const) {
      expect(portalOfferingTeachingPeriod({ academicCalendarPeriod: null, startDate, endDate })).toBeNull();
    }
  });
});
