import { describe, expect, test } from "bun:test";
import {
  assertTeachingLeaveReviewer,
  isTeachingLeaveLate,
  isTeachingLeaveOccurrenceExpired,
  scheduledInstant,
  TeachingLeaveAuthorizationError,
} from "./teaching-leave-service.ts";
import type { AuthUser } from "../../core/auth/token.ts";

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


describe("teaching leave reviewer authorization", () => {
  const request = {
    programmeId: "dse",
    requester: { id: "11111111-1111-4111-8111-111111111111", name: "Requesting Lecturer" },
  };

  test("allows a programme-scoped coordinator reviewer", () => {
    const reviewer: AuthUser = {
      id: "22222222-2222-4222-8222-222222222222",
      email: "reviewer@example.test",
      roles: ["program_coordinator"],
      programmeRoles: [{ role: "program_coordinator", programmeId: "dse" }],
    };
    expect(() => assertTeachingLeaveReviewer(reviewer, request)).not.toThrow();
  });

  test("rejects a manager from another programme", () => {
    const reviewer: AuthUser = {
      id: "22222222-2222-4222-8222-222222222222",
      email: "reviewer@example.test",
      roles: ["program_coordinator"],
      programmeRoles: [{ role: "program_coordinator", programmeId: "other" }],
    };
    expect(() => assertTeachingLeaveReviewer(reviewer, request)).toThrow(TeachingLeaveAuthorizationError);
  });

  test("rejects self-review even when the requester also has reviewer authority", () => {
    const requesterReviewer: AuthUser = {
      id: request.requester.id,
      email: "requester@example.test",
      roles: ["lecturer", "admin"],
      programmeRoles: [
        { role: "lecturer", programmeId: "dse" },
        { role: "admin", programmeId: null },
      ],
    };
    expect(() => assertTeachingLeaveReviewer(requesterReviewer, request)).toThrow(
      "A lecturer cannot review their own teaching leave request",
    );
  });
});
