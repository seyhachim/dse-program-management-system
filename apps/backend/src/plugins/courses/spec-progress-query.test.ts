import { describe, expect, test } from "bun:test";
import {
  listSpecProgressForCourseIds,
  specProgressCourseFilter,
} from "./service.ts";

describe("Course Spec progress query scoping", () => {
  test("builds a deduplicated database filter for requested course ids", () => {
    expect(
      specProgressCourseFilter(["course-b", "course-a", "course-b"]),
    ).toEqual({
      id: { in: ["course-b", "course-a"] },
    });
  });

  test("skips the catalog query when there are no missing Responsible courses", async () => {
    expect(await listSpecProgressForCourseIds([])).toEqual([]);
  });

  test("Responsible-only merge no longer falls back to unscoped progress", async () => {
    const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();

    expect(source).toContain("listSpecProgressForCourseIds(");
    expect(source).toContain("missingResponsibleCourseIds");
    expect(source).not.toContain(
      "const allProgress = await offeringScopedSpecProgress();",
    );
  });
});
