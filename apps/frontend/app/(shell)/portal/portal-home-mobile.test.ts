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

  test("uses the existing official DSE logo in a compact branded header", () => {
    expect(portalHomeSource).toContain('src="/dse-logo.svg"');
    expect(portalHomeSource).toContain('alt="DSE logo"');
    expect(portalHomeSource).toContain("DSE Student Portal");
    expect(portalHomeSource).not.toContain("UserRound");
  });

  test("surfaces four high-frequency student shortcuts", () => {
    expect(portalHomeSource).toContain('label: "Schedule", href: "/portal/schedule"');
    expect(portalHomeSource).toContain('label: "Courses", href: "/portal/courses"');
    expect(portalHomeSource).toContain(
      'label: "Assessments", href: "/portal/assessments"',
    );
    expect(portalHomeSource).toContain('label: "Results", href: "/portal/results"');
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
  });

  test("keeps upcoming assessments ahead of secondary information", () => {
    const assessmentsIndex = portalHomeSource.indexOf("Coming up");
    const announcementsIndex = portalHomeSource.indexOf("Latest announcements");
    const calendarIndex = portalHomeSource.indexOf("Academic calendar");

    expect(assessmentsIndex).toBeGreaterThan(-1);
    expect(announcementsIndex).toBeGreaterThan(-1);
    expect(calendarIndex).toBeGreaterThan(-1);
    expect(assessmentsIndex).toBeLessThan(announcementsIndex);
    expect(announcementsIndex).toBeLessThan(calendarIndex);
  });

  test("keeps the home feed concise and removes redundant course browsing", () => {
    expect(portalHomeSource).toContain("upcomingAssessments.slice(0, 3)");
    expect(portalHomeSource).toContain("announcements.slice(0, 2)");
    expect(portalHomeSource).not.toContain("My courses");
  });
});
