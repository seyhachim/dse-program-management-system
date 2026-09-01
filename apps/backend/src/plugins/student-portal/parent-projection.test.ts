import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parentAcademicStatusForProgression } from "./parent-projection";

describe("parent academic projection", () => {
  test("maps only explicit recorded progression states", () => {
    expect(parentAcademicStatusForProgression("Progressed")).toBe("ON_TRACK");
    expect(parentAcademicStatusForProgression("Graduated")).toBe("ON_TRACK");
    expect(parentAcademicStatusForProgression("Retained")).toBe("NEEDS_ATTENTION");
    expect(parentAcademicStatusForProgression("Inactive")).toBe("NEEDS_ATTENTION");
    expect(parentAcademicStatusForProgression("Withdrawn")).toBe("UNAVAILABLE");
    expect(parentAcademicStatusForProgression("Transferred")).toBe("UNAVAILABLE");
    expect(parentAcademicStatusForProgression(null)).toBe("UNAVAILABLE");
  });

  test("official results are finalized, published, approved-spec course totals only", () => {
    const source = readFileSync(new URL("./parent-projection.ts", import.meta.url), "utf8");
    expect(source).toContain('publishedAt: { not: null }');
    expect(source).toContain('finalizedAt: { not: null }');
    expect(source).toContain('spec.reviewStatus !== "Approved"');
    expect(source).toContain("calculateCourseGrade(spec.assessmentItems, finalized)");
    expect(source).toContain("if (!grade.complete || grade.totalGrade === null) return []");
  });
});
