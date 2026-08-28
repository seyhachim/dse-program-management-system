import { describe, expect, test } from "bun:test";
import type { CourseSpecProgress } from "@dse-pms/shared-types";
import { buildCourseSpecProgressGroups, courseSpecRowsPercent, visibleCourseSpecRows } from "./course-spec-progress-groups";

function row(
  code: string,
  completed: number,
  placement?: CourseSpecProgress["curriculumPlacement"],
): CourseSpecProgress {
  return {
    courseId: `00000000-0000-4000-8000-${code.padEnd(12, "0").slice(0, 12)}`,
    code,
    title: code,
    completed,
    total: 10,
    curriculumPlacement: placement ?? null,
    incompleteSections: [],
  };
}

describe("Course Specification dashboard grouping", () => {
  test("groups by authoritative curriculum placement, not the course code", () => {
    const grouped = buildCourseSpecProgressGroups([
      row("MAT101", 4, { programmeYear: 2, semester: "First", sortOrder: 0 }),
      row("DSE401", 8, { programmeYear: 4, semester: "Second", sortOrder: 0 }),
      row("BPR101", 7, { programmeYear: 1, semester: "First", sortOrder: 0 }),
    ]);

    expect(grouped.years.map((group) => group.programmeYear)).toEqual([1, 2, 4]);
    expect(grouped.years[1]?.semesters[0]?.courses.map((course) => course.code)).toEqual(["MAT101"]);
  });

  test("orders semester courses by curriculum sort order with code fallback", () => {
    const grouped = buildCourseSpecProgressGroups([
      row("CCC101", 0, { programmeYear: 1, semester: "First", sortOrder: 2 }),
      row("BBB101", 0, { programmeYear: 1, semester: "First", sortOrder: 1 }),
      row("AAA101", 0, { programmeYear: 1, semester: "First", sortOrder: 1 }),
    ]);

    expect(grouped.years[0]?.semesters[0]?.courses.map((course) => course.code)).toEqual([
      "AAA101",
      "BBB101",
      "CCC101",
    ]);
  });

  test("keeps courses without an active curriculum placement visible but separate", () => {
    const grouped = buildCourseSpecProgressGroups([
      row("OLD402", 6),
      row("CUR201", 4, { programmeYear: 2, semester: "Second", sortOrder: 0 }),
    ]);

    expect(grouped.unassigned.courses.map((course) => course.code)).toEqual(["OLD402"]);
    expect(grouped.years[0]?.courseCount).toBe(1);
  });

  test("filters only fully complete rows when incomplete-only mode is enabled", () => {
    const rows = [row("AAA101", 10), row("BBB101", 4), row("CCC101", 0)];

    expect(visibleCourseSpecRows(rows, true).map((course) => course.code)).toEqual([
      "BBB101",
      "CCC101",
    ]);
    expect(visibleCourseSpecRows(rows, false).map((course) => course.code)).toEqual([
      "AAA101",
      "BBB101",
      "CCC101",
    ]);
  });

  test("recalculates visible group counts and percentages after incomplete filtering", () => {
    const rows = [
      row("AAA101", 10, { programmeYear: 1, semester: "First", sortOrder: 0 }),
      row("BBB101", 4, { programmeYear: 1, semester: "First", sortOrder: 1 }),
    ];
    const visible = buildCourseSpecProgressGroups(visibleCourseSpecRows(rows, true));
    expect(visible.years[0]?.courseCount).toBe(1);
    expect(visible.years[0]?.percent).toBe(40);
    expect(visible.years[0]?.semesters[0]?.courseCount).toBe(1);
    expect(visible.years[0]?.semesters[0]?.percent).toBe(40);
  });

  test("uses section-weighted completion percentages", () => {
    expect(courseSpecRowsPercent([row("AAA101", 5), row("BBB101", 10)])).toBe(75);
  });
});
