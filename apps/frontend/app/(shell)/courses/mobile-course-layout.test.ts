import { describe, expect, test } from "bun:test";
import { courseSpecHref, MOBILE_COURSES_LAYOUT } from "./mobile-course-layout";

describe("mobile Courses layout", () => {
  test("phone presentation is hidden from desktop and keeps touch-sized controls", () => {
    expect(MOBILE_COURSES_LAYOUT.toolbar).toContain("md:hidden");
    expect(MOBILE_COURSES_LAYOUT.cards).toContain("md:hidden");
    expect(MOBILE_COURSES_LAYOUT.desktop).toContain("md:block");
    expect(MOBILE_COURSES_LAYOUT.search).toContain("h-11");
    expect(MOBILE_COURSES_LAYOUT.primaryAction).toContain("h-11");
    expect(MOBILE_COURSES_LAYOUT.secondaryAction).toContain("min-h-11");
  });

  test("lecturer filters stay phone-safe while desktop filters remain separate", () => {
    expect(MOBILE_COURSES_LAYOUT.filters).toContain("grid-cols-2");
    expect(MOBILE_COURSES_LAYOUT.filters).toContain("md:hidden");
    expect(MOBILE_COURSES_LAYOUT.filterTrigger).toContain("h-11");
    expect(MOBILE_COURSES_LAYOUT.filterTrigger).toContain("w-full");
    expect(MOBILE_COURSES_LAYOUT.desktopFilters).toContain("hidden");
    expect(MOBILE_COURSES_LAYOUT.desktopFilters).toContain("md:flex");
    expect(MOBILE_COURSES_LAYOUT.groupHeader).toContain("text-xs");
  });

  test("reviewers enter the existing Review & Submit workflow", () => {
    expect(courseSpecHref("course-1", true)).toBe(
      "/courses/course-1/spec?tab=reviewSubmit",
    );
    expect(courseSpecHref("course-1", false)).toBe("/courses/course-1/spec");
  });
});
