import { describe, expect, test } from "bun:test";
import {
  MISSING_RESUBMISSION_SPECIFICATION_DATE_ERROR,
  specificationDateForSubmission,
} from "./automatic-specification-date";

describe("automatic Course Specification date", () => {
  test("uses the Cambodia calendar date on first submission", () => {
    const date = specificationDateForSubmission({
      reviewStatus: "Draft",
      existingDate: null,
      // 17:30 UTC is already the next calendar day in Cambodia.
      now: new Date("2026-08-27T17:30:00.000Z"),
    });

    expect(date.toISOString()).toBe("2026-08-28T00:00:00.000Z");
  });

  test("preserves an existing date on resubmission", () => {
    const existingDate = new Date("2026-08-20T00:00:00.000Z");

    expect(
      specificationDateForSubmission({
        reviewStatus: "ChangesRequested",
        existingDate,
        now: new Date("2026-08-28T01:00:00.000Z"),
      }),
    ).toEqual(existingDate);
  });

  test("fails closed when a legacy Changes Requested record has no original date", () => {
    expect(() =>
      specificationDateForSubmission({
        reviewStatus: "ChangesRequested",
        existingDate: null,
        now: new Date("2026-08-28T01:00:00.000Z"),
      }),
    ).toThrow(MISSING_RESUBMISSION_SPECIFICATION_DATE_ERROR);
  });
});
