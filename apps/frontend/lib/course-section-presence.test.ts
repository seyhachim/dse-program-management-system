import { describe, expect, test } from "bun:test";
import { optionalCourseSectionPresence } from "./course-section-presence";

describe("optional Course section presence metadata", () => {
  test("preserves successful metadata", async () => {
    const rows = [{ courseId: "course-1", hasSections: true }];
    await expect(optionalCourseSectionPresence(Promise.resolve(rows))).resolves.toEqual(
      rows,
    );
  });

  test("degrades to an empty metadata set when the optional request fails", async () => {
    await expect(
      optionalCourseSectionPresence(Promise.reject(new Error("transient failure"))),
    ).resolves.toEqual([]);
  });
});
