import { describe, expect, test } from "bun:test";
import {
  isTeachingLeaveLate,
  isTeachingLeaveOccurrenceExpired,
  scheduledInstant,
} from "./teaching-leave-service.ts";

describe("teaching leave timing policy", () => {
  test("interprets DSE schedule times in Cambodia local time", () => {
    expect(scheduledInstant("2026-09-09", "08:00").toISOString()).toBe("2026-09-09T01:00:00.000Z");
  });

  test("derives late/current-session requests from the configured notice window", () => {
    const now = new Date("2026-09-09T00:00:00.000Z");
    expect(isTeachingLeaveLate("2026-09-09", "08:00", 24, now)).toBe(true);
    expect(isTeachingLeaveLate("2026-09-11", "08:00", 24, now)).toBe(false);
  });

  test("treats an occurrence as expired at its Cambodia-local end time", () => {
    const beforeEnd = new Date("2026-09-09T02:59:59.000Z");
    const atEnd = new Date("2026-09-09T03:00:00.000Z");
    expect(isTeachingLeaveOccurrenceExpired("2026-09-09", "10:00", beforeEnd)).toBe(false);
    expect(isTeachingLeaveOccurrenceExpired("2026-09-09", "10:00", atEnd)).toBe(true);
  });
});
