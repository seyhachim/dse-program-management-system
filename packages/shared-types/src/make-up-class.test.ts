import { describe, expect, test } from "bun:test";
import { ProposeMakeUpClassSchema, ReviewMakeUpClassSchema } from "./make-up-class.ts";

const valid = {
  offeringId: "11111111-1111-4111-8111-111111111111",
  offeringMeetingId: "22222222-2222-4222-8222-222222222222",
  originalDate: "2026-11-23",
  replacementDate: "2026-11-28",
  startTime: "08:00",
  endTime: "12:00",
  note: "Recover missed four-hour lecture",
};

describe("make-up class input integrity", () => {
  test("accepts a later teaching date and 24-hour time range", () => {
    expect(ProposeMakeUpClassSchema.safeParse(valid).success).toBe(true);
  });
  test("rejects a reverse date, overlapping/zero duration, and invalid clock", () => {
    expect(ProposeMakeUpClassSchema.safeParse({ ...valid, replacementDate: "2026-11-22" }).success).toBe(false);
    expect(ProposeMakeUpClassSchema.safeParse({ ...valid, endTime: "08:00" }).success).toBe(false);
    expect(ProposeMakeUpClassSchema.safeParse({ ...valid, startTime: "25:00" }).success).toBe(false);
  });
  test("approval requires explicit reviewer recovery verification", () => {
    expect(ReviewMakeUpClassSchema.safeParse({ decision: "APPROVE" }).success).toBe(false);
    expect(ReviewMakeUpClassSchema.safeParse({ decision: "APPROVE", confirmedMissed: true }).success).toBe(true);
    expect(ReviewMakeUpClassSchema.safeParse({ decision: "REJECT", note: "Original was held" }).success).toBe(true);
  });
});
