import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./portal-courses.tsx", import.meta.url),
  "utf8",
);
const badgeSource = readFileSync(
  new URL("../course-achievement-badges.tsx", import.meta.url),
  "utf8",
);
const attendanceSource = readFileSync(
  new URL("./course-attendance-progress.tsx", import.meta.url),
  "utf8",
);

describe("Student Portal compact course cards", () => {
  test("loads optional achievement and calendar metadata without blocking courses", () => {
    expect(source).toContain(".courseAchievements()");
    expect(source).toContain('useCachedPortalData("courses", load)');
    expect(source).toContain('"course-achievements"');
    expect(source).toContain('"academic-calendar"');
    expect(source).toContain(
      "catch((): PortalCourseAchievementSummary[] => [])",
    );
    expect(source).not.toContain("monitorDeliveryApi");
    expect(source).not.toContain("monitorRolesByOffering");
  });

  test("keeps achievements course-specific and adds attendance progress", () => {
    expect(source).toContain("summary.offeringId");
    expect(source).toContain(
      "achievementsByOffering.get(course.offeringId) ?? null",
    );
    expect(source).toContain("<CourseAchievementBadges summary={achievement} />");
    expect(source).toContain("<CourseAttendanceProgress");
    expect(badgeSource).not.toContain("Course role:");
    expect(badgeSource).not.toContain("ClassResponsibilityRole");
  });

  test("uses compact wrapping cards for current, planned, and historical sections", () => {
    expect(source).toContain("courses={currentCourses}");
    expect(source).toContain("courses={plannedCourses}");
    expect(source).toContain("courses={historicalCourses}");
    expect(
      source.match(
        /courses=\{(?:currentCourses|plannedCourses|historicalCourses)\}/g,
      )?.length,
    ).toBe(3);
    expect(source).toContain("achievementsByOffering={achievementsByOffering}");
    expect(source).toContain("calendar={calendar}");
    expect(source).toContain("flex min-w-0 flex-wrap gap-x-3 gap-y-1.5");
    expect(attendanceSource).toContain("gridTemplateColumns");
    expect(attendanceSource).toContain(
      'aria-label="Teaching-week attendance progress"',
    );
  });
});
