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
    expect(scheduleSource).toContain("studentScheduleApi.impacts()");
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
    expect(scheduleSource).toContain("monitorOfferingIds.has(course.offeringId) && !impact");
    expect(scheduleSource).toContain("offeringId=${encodeURIComponent(");
    expect(scheduleSource).toContain("meetingId=${encodeURIComponent(meeting.id)}");
    expect(scheduleSource).toContain("date=${encodeURIComponent(");
    expect(scheduleSource).toContain("occurrenceDateKey");
    expect(scheduleSource).toContain("Record class delivery");
  });

  test("focuses the exact approved leave occurrence from the home deep link", () => {
    expect(scheduleSource).toContain('searchParams.get("date")');
    expect(scheduleSource).toContain('searchParams.get("focus")');
    expect(scheduleSource).toContain("setExpandedImpactId(requestedFocus || null)");
    expect(scheduleSource).toContain("schedule-impact-${requestedFocus}");
    expect(scheduleSource).toContain("scrollIntoView");
  });

  test("shows student-safe schedule change details and no private leave fields", () => {
    expect(scheduleSource).toContain("Schedule changed");
    expect(scheduleSource).toContain("Class cancelled for this session");
    expect(scheduleSource).toContain("This class will not take place at the scheduled time.");
    expect(scheduleSource).toContain("Make-up or replacement class");
    expect(scheduleSource).toContain("Not scheduled yet");
    expect(scheduleSource).toContain("We’ll update this schedule when a new session is confirmed.");
    expect(scheduleSource).toContain("View schedule update");
    expect(scheduleSource).not.toContain("confidentialReason");
    expect(scheduleSource).not.toContain("reviewComment");
    expect(scheduleSource).not.toContain("attachmentRef");
  });

  test("groups the week by teaching day and keeps course navigation", () => {
    expect(scheduleSource).toContain("weekGroups.map");
    expect(scheduleSource).toContain("option.weekdayLong");
    expect(scheduleSource).toContain("groupEntries.map");
    expect(scheduleSource).toContain('href={`/portal/courses/${course.offeringId}`}');
  });
});
