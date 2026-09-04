import { describe, expect, test } from "bun:test";

const SERVICE_PATH = new URL("./service.ts", import.meta.url);

describe("Course Information synopsis persistence integrity", () => {
  test("spec synopsis saves never mutate authoritative prerequisites", async () => {
    const source = await Bun.file(SERVICE_PATH).text();
    const start = source.indexOf('if (sectionId === "courseInfo")');
    const end = source.indexOf('if (sectionId === "clos")', start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const courseInfoSave = source.slice(start, end);
    expect(courseInfoSave).toContain("description: info.description || null");
    expect(courseInfoSave).toContain('description: info.description ?? ""');
    expect(courseInfoSave).not.toContain("prerequisites:");
  });

  test("review-lock assertion still runs before any Course Information mutation", async () => {
    const source = await Bun.file(SERVICE_PATH).text();
    const lock = source.indexOf("assertCourseSpecEditable(existingSpec.reviewStatus)");
    const mutation = source.indexOf('if (sectionId === "courseInfo")');

    expect(lock).toBeGreaterThanOrEqual(0);
    expect(mutation).toBeGreaterThan(lock);
  });
});
