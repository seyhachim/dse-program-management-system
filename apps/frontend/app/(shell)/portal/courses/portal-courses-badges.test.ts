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

  test("keeps achievements useful without filling cards with locked badges", () => {
    expect(source).toContain("summary.offeringId");
    expect(source).toContain(
      "achievementsByOffering.get(course.offeringId) ?? null",
    );
    expect(source).toContain(
      "<CourseAchievementBadges summary={achievement} showLocked={false} />",
    );
    expect(source).toContain('const showProgress = course.lifecycle !== "planned";');
    expect(source).toContain("<CourseAttendanceProgress");
    expect(source).toContain("compact");
    expect(badgeSource).not.toContain("Course role:");
    expect(badgeSource).not.toContain("ClassResponsibilityRole");
  });

  test("uses a readable desktop layout for current, planned, and historical sections", () => {
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
    expect(source).toContain('"grid max-w-3xl gap-4"');
    expect(source).toContain('"grid gap-4 lg:grid-cols-2"');
    expect(source).toContain("Section {course.sectionCode}");
    expect(source).toContain("Open course");
    expect(attendanceSource).toContain("gridTemplateColumns");
    expect(attendanceSource).toContain(
      'aria-label="Teaching-week attendance progress"',
    );
  });

  test("uses student-facing copy instead of lecturer/admin terminology", () => {
    expect(source).toContain("Courses you are enrolled in this term.");
    expect(source).toContain("Courses already scheduled for a future term.");
    expect(source).not.toContain("current teaching period");
    expect(source).not.toContain("Active offerings");
  });
});
