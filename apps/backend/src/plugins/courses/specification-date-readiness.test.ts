import { describe, expect, test } from "bun:test";
import {
  hasSpecificationDate,
  isSpecificationDateReady,
  SPECIFICATION_DATE_REQUIRED_ERROR,
} from "./specification-date-readiness";

describe("Specification Date submission readiness", () => {
  test("rejects null, empty, and whitespace-only values", () => {
    expect(hasSpecificationDate(null)).toBe(false);
    expect(hasSpecificationDate("")).toBe(false);
    expect(hasSpecificationDate("   ")).toBe(false);
  });

  test("requires complete status plus a persisted date", () => {
    expect(isSpecificationDateReady("incomplete", "2026-08-20")).toBe(false);
    expect(isSpecificationDateReady("complete", null)).toBe(false);
    expect(isSpecificationDateReady("complete", "   ")).toBe(false);
    expect(isSpecificationDateReady("complete", "2026-08-20")).toBe(true);
  });

  test("keeps the API validation message stable", () => {
    expect(SPECIFICATION_DATE_REQUIRED_ERROR).toBe(
      "Course specification is incomplete: Specification Date is required before submission",
    );
  });
});
