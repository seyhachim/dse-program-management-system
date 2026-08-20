import { describe, expect, test } from "bun:test";
import {
  hasSpecificationDate,
  isSpecificationDateReady,
} from "./specification-date-readiness";

describe("Specification Date readiness", () => {
  test("rejects null, empty, and whitespace-only values", () => {
    expect(hasSpecificationDate(null)).toBe(false);
    expect(hasSpecificationDate("")).toBe(false);
    expect(hasSpecificationDate("   ")).toBe(false);
  });

  test("requires both a complete section and a persisted date", () => {
    expect(isSpecificationDateReady("incomplete", "2026-08-20")).toBe(false);
    expect(isSpecificationDateReady("complete", null)).toBe(false);
    expect(isSpecificationDateReady("complete", "   ")).toBe(false);
    expect(isSpecificationDateReady("complete", "2026-08-20")).toBe(true);
  });
});
