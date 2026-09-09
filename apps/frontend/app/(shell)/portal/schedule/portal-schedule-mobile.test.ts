import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const scheduleSource = readFileSync(
  new URL("./portal-schedule.tsx", import.meta.url),
  "utf8",
);

describe("Student Portal mobile schedule contract", () => {
  test("loads published calendar context alongside enrolled schedule data", () => {
    expect(scheduleSource).toContain("studentPortalApi.courses()");
    expect(scheduleSource).toContain("monitorDeliveryApi.assignments()");
    expect(scheduleSource).toContain("studentPortalApi.academicCalendar()");
    expect(scheduleSource).toContain("resolveStudentTeachingContext(");
  });

  test("offers Day and Week views with Day as the default", () => {
    expect(scheduleSource).toContain('useState<"day" | "week">("day")');
    expect(scheduleSource).toContain('aria-label="Schedule view"');
    expect(scheduleSource).toContain('mode === "day" ? "Day" : "Week"');
    expect(scheduleSource).toContain('view === "day" ? (');
    expect(scheduleSource).toContain("Week schedule");
  });

  test("uses a fixed Monday through Saturday teaching strip", () => {
    expect(scheduleSource).toContain("buildTeachingWeekDateOptions(selectedDate)");
    expect(scheduleSource).toContain('aria-label="Monday to Saturday"');
    expect(scheduleSource).toContain("Monday–Saturday");
    expect(scheduleSource).not.toContain("Nearby dates");
  });

  test("keeps monitor delivery actions tied to exact offering and occurrence date", () => {
    expect(scheduleSource).toContain("monitorOfferingIds.has(course.offeringId)");
    expect(scheduleSource).toContain("offeringId=${encodeURIComponent(");
    expect(scheduleSource).toContain("meetingId=${encodeURIComponent(meeting.id)}");
    expect(scheduleSource).toContain("date=${encodeURIComponent(");
    expect(scheduleSource).toContain("occurrenceDateKey");
    expect(scheduleSource).toContain("Record class delivery");
  });

  test("groups the week by teaching day and keeps course navigation", () => {
    expect(scheduleSource).toContain("weekGroups.map");
    expect(scheduleSource).toContain("option.weekdayLong");
    expect(scheduleSource).toContain("groupEntries.map");
    expect(scheduleSource).toContain('href={`/portal/courses/${course.offeringId}`}');
  });
});
