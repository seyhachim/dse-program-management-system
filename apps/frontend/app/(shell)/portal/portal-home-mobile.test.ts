import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const portalHomeSource = readFileSync(
  new URL("./portal-home.tsx", import.meta.url),
  "utf8",
);

describe("Student Portal mobile home contract", () => {
  test("keeps internal curriculum terminology off the student home", () => {
    expect(portalHomeSource).not.toContain("CLO");
    expect(portalHomeSource).not.toContain("CourseSpec");
  });

  test("keeps official DSE branding and student identity in the hero", () => {
    expect(portalHomeSource).toContain('src="/dse-logo.svg"');
    expect(portalHomeSource).toContain('alt="DSE logo"');
    expect(portalHomeSource).toContain("DSE Student Portal");
    expect(portalHomeSource).toContain('aria-label="Student identity"');
    expect(portalHomeSource).toContain("Student ID · {data.student.studentId}");
  });

  test("surfaces four high-frequency student shortcuts", () => {
    for (const label of ["Schedule", "Courses", "Assessments", "Results"]) {
      expect(portalHomeSource).toContain(`label: "${label}"`);
    }
    for (const href of [
      "/portal/schedule",
      "/portal/courses",
      "/portal/assessments",
      "/portal/results",
    ]) {
      expect(portalHomeSource).toContain(`href: "${href}"`);
    }
    expect(portalHomeSource).toContain('aria-label="Student shortcuts"');
  });

  test("makes schedule context the primary home card", () => {
    const returnIndex = portalHomeSource.indexOf("return (");
    const nextClassLinkIndex = portalHomeSource.indexOf(
      'href="/portal/schedule"',
      returnIndex,
    );
    const shortcutsIndex = portalHomeSource.indexOf(
      'aria-label="Student shortcuts"',
      returnIndex,
    );

    expect(nextClassLinkIndex).toBeGreaterThan(-1);
    expect(shortcutsIndex).toBeGreaterThan(-1);
    expect(nextClassLinkIndex).toBeLessThan(shortcutsIndex);
    expect(portalHomeSource).toContain("nextScheduledMeeting(data.courses, new Date())");
    expect(portalHomeSource).toContain("nextMeeting.course.lecturer?.name");
    expect(portalHomeSource).toContain("View schedule");
    expect(portalHomeSource).toContain("Time");
    expect(portalHomeSource).toContain("Room");
    expect(portalHomeSource).toContain("Lecturer");
  });

  test("keeps assessments ahead of secondary information and improves scanability", () => {
    const assessmentsIndex = portalHomeSource.indexOf("Upcoming work");
    const announcementsIndex = portalHomeSource.indexOf("Latest announcements");
    const calendarIndex = portalHomeSource.indexOf("Academic calendar");

    expect(assessmentsIndex).toBeGreaterThan(-1);
    expect(announcementsIndex).toBeGreaterThan(-1);
    expect(calendarIndex).toBeGreaterThan(-1);
    expect(assessmentsIndex).toBeLessThan(announcementsIndex);
    expect(announcementsIndex).toBeLessThan(calendarIndex);
    expect(portalHomeSource).toContain("CalendarClock");
    expect(portalHomeSource).toContain("% weight");
  });

  test("keeps the home feed concise and long content viewport-safe", () => {
    expect(portalHomeSource).toContain("upcomingAssessments.slice(0, 3)");
    expect(portalHomeSource).toContain("announcements.slice(0, 2)");
    expect(portalHomeSource).toContain("min-w-0");
    expect(portalHomeSource).toContain("break-words");
    expect(portalHomeSource).not.toContain("My courses");
  });
});
