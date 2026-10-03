import { describe, expect, test } from "bun:test";
import { currentProgrammeYearFromLatest } from "./cohort-service.ts";

describe("current programme year projection", () => {
  test("uses authoritative progression semantics for roster display", () => {
    expect(currentProgrammeYearFromLatest(undefined)).toBeNull();
    expect(currentProgrammeYearFromLatest({ programmeYear: null, status: "Continuing" })).toBeNull();
    expect(currentProgrammeYearFromLatest({ programmeYear: 3, status: "Continuing" })).toBe(3);
    expect(currentProgrammeYearFromLatest({ programmeYear: 2, status: "Retained" })).toBe(2);
    expect(currentProgrammeYearFromLatest({ programmeYear: 2, status: "Progressed" })).toBe(3);
    expect(currentProgrammeYearFromLatest({ programmeYear: 4, status: "Progressed" })).toBe(4);
    expect(currentProgrammeYearFromLatest({ programmeYear: 3, status: "Withdrawn" })).toBeNull();
  });
});
