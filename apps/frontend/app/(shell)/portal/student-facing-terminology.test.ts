import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const STUDENT_SURFACES = [
  ["home", "./portal-home.tsx"],
  ["courses", "./courses/portal-courses.tsx"],
  ["courses page", "./courses/page.tsx"],
  ["course detail", "./courses/[offeringId]/portal-course.tsx"],
  ["course detail page", "./courses/[offeringId]/page.tsx"],
  ["assessments", "./assessments/portal-assessments.tsx"],
  ["assessments page", "./assessments/page.tsx"],
  ["results", "./results/portal-results.tsx"],
  ["results page", "./results/page.tsx"],
] as const;

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("core Student Portal terminology", () => {
  for (const [label, path] of STUDENT_SURFACES) {
    test(`${label} avoids internal curriculum terminology in visible copy`, () => {
      const contents = source(path);

      expect(contents).not.toContain("CLO");
      expect(contents.toLowerCase()).not.toContain("course specification");
      expect(contents).not.toContain("Approved specification");
      expect(contents).not.toContain("Specification pending");
    });
  }

  test("course list uses generic learning-information availability wording", () => {
    const contents = source("./courses/portal-courses.tsx");

    expect(contents).toContain("Learning details available");
    expect(contents).toContain("Learning details pending");
  });

  test("course detail keeps student-useful learning content without spec document or outcome-code UI", () => {
    const contents = source("./courses/[offeringId]/portal-course.tsx");

    expect(contents).toContain('Card title="Weekly topics"');
    expect(contents).toContain('Card title="Assessment plan"');
    expect(contents).toContain('Card title="Published results"');
    expect(contents).toContain('Card title="Learning resources"');
    expect(contents).not.toContain("cloCodes");
    expect(contents).not.toContain("downloadApprovedCourseDocument");
    expect(contents).not.toContain("Download approved document");
  });

  test("assessment and result screens do not render outcome-code metadata", () => {
    expect(source("./assessments/portal-assessments.tsx")).not.toContain(
      "cloCodes",
    );
    expect(source("./results/portal-results.tsx")).not.toContain(
      "overallAchievement",
    );
    expect(source("./results/portal-results.tsx")).not.toContain(
      "achievements.map",
    );
  });
});
