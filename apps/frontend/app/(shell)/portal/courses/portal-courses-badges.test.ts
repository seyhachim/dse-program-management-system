import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./portal-courses.tsx", import.meta.url),
  "utf8",
);

describe("Student Portal course card achievements", () => {
  test("loads optional achievement and monitor metadata without blocking courses", () => {
    expect(source).toContain(".courseAchievements()");
    expect(source).toContain("monitorDeliveryApi");
    expect(source).toContain(".assignments()");
    expect(source).toContain(
      "catch((): PortalCourseAchievementSummary[] => [])",
    );
    expect(source).toContain(
      "catch((): MonitorClassResponsibilityView[] => [])",
    );
  });

  test("matches achievements and monitor roles to each exact offering", () => {
    expect(source).toContain("summary.offeringId");
    expect(source).toContain("assignment.offeringId");
    expect(source).toContain(
      "achievementsByOffering.get(course.offeringId) ?? null",
    );
    expect(source).toContain(
      "monitorRolesByOffering.get(course.offeringId) ?? null",
    );
    expect(source).toContain("<CourseAchievementBadges");
  });

  test("uses the badge component for current, planned, and historical course sections", () => {
    expect(source).toContain("courses={currentCourses}");
    expect(source).toContain("courses={plannedCourses}");
    expect(source).toContain("courses={historicalCourses}");
    expect(source.match(/achievementsByOffering={achievementsByOffering}/g)?.length).toBe(3);
    expect(source.match(/monitorRolesByOffering={monitorRolesByOffering}/g)?.length).toBe(3);
  });
});
