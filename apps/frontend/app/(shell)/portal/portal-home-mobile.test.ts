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

  test("surfaces Courses, Schedule, and Results as primary shortcuts", () => {
    expect(portalHomeSource).toContain('label: "Courses", href: "/portal/courses"');
    expect(portalHomeSource).toContain('label: "Schedule", href: "/portal/schedule"');
    expect(portalHomeSource).toContain('label: "Results", href: "/portal/results"');
  });

  test("makes the next class card open the schedule", () => {
    const nextClassIndex = portalHomeSource.indexOf("Next class");
    const scheduleLinkIndex = portalHomeSource.lastIndexOf(
      'href="/portal/schedule"',
      nextClassIndex,
    );

    expect(nextClassIndex).toBeGreaterThan(-1);
    expect(scheduleLinkIndex).toBeGreaterThan(-1);
  });

  test("puts upcoming assessments before course browsing", () => {
    const assessmentsIndex = portalHomeSource.indexOf("Upcoming assessments");
    const coursesIndex = portalHomeSource.indexOf("My courses");

    expect(assessmentsIndex).toBeGreaterThan(-1);
    expect(coursesIndex).toBeGreaterThan(-1);
    expect(assessmentsIndex).toBeLessThan(coursesIndex);
  });
});
