import { describe, expect, test } from "bun:test";
import { OVERVIEW_REQUIRED_SECTIONS } from "./overview-sections";

describe("overview required sections", () => {
  test("counts Teaching & Learning as lecturer work and excludes automatic Specification Date", () => {
    const ids = OVERVIEW_REQUIRED_SECTIONS.map((section) => section.id);

    expect(ids).toContain("teachingLearning");
    expect(ids).not.toContain("date");
    expect(ids).toHaveLength(10);
  });

  test("keeps Teaching & Learning immediately after CLOs for recommended-next-step order", () => {
    const ids = OVERVIEW_REQUIRED_SECTIONS.map((section) => section.id);
    const cloIndex = ids.indexOf("clos");

    expect(cloIndex).toBeGreaterThanOrEqual(0);
    expect(ids[cloIndex + 1]).toBe("teachingLearning");
  });
});
