import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./attendance-client.tsx", import.meta.url), "utf8");

describe("Attendance date-scoped class selector", () => {
  test("filters the assigned offering list by the selected attendance date", () => {
    expect(source).toContain("offeringsScheduledOnDate(offerings, date)");
    expect(source).toContain("scheduledOfferings.map((offering)");
    expect(source).not.toContain("{offerings.map((offering) => (");
  });

  test("does not retain a class that is not scheduled on the new date", () => {
    expect(source).toContain(
      "scheduledOfferings.some((offering) => offering.id === current)",
    );
    expect(source).toContain('return scheduledOfferings[0]?.id ?? "";');
  });

  test("shows a clear no-class state instead of falling back to all offerings", () => {
    expect(source).toContain("No classes scheduled for this date");
    expect(source).toContain(
      "Choose another attendance date to see classes from the teaching timetable.",
    );
    expect(source).toContain("disabled={scheduledOfferings.length === 0}");
  });
});
