import { describe, expect, test } from "bun:test";
import { SaveAttendanceInput } from "./attendance";

const records = [{ studentId: "11111111-1111-4111-8111-111111111111", status: "Present" }];

describe("attendance save version contract", () => {
  test("accepts null for an unsaved session and an ISO version for an existing one", () => {
    expect(SaveAttendanceInput.safeParse({ records, expectedUpdatedAt: null }).success).toBe(true);
    expect(SaveAttendanceInput.safeParse({ records, expectedUpdatedAt: "2026-09-17T07:00:00.000Z" }).success).toBe(true);
  });

  test("rejects malformed server versions", () => {
    expect(SaveAttendanceInput.safeParse({ records, expectedUpdatedAt: "yesterday" }).success).toBe(false);
  });
});
