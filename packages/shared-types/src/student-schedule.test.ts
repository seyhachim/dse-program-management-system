import { describe, expect, test } from "bun:test";
import { PortalScheduleImpactSchema } from "./student-schedule.ts";

const safeImpact = {
  occurrenceId: "11111111-1111-4111-8111-111111111111",
  offeringId: "22222222-2222-4222-8222-222222222222",
  meetingId: "33333333-3333-4333-8333-333333333333",
  sessionDate: "2026-09-14",
  state: "cancelled" as const,
  originalStartTime: "07:00",
  originalEndTime: "11:00",
  originalRoom: "306",
};

describe("student schedule impact contract", () => {
  test("accepts only the operational fields students need", () => {
    expect(PortalScheduleImpactSchema.parse(safeImpact)).toEqual(safeImpact);
  });

  test.each([
    ["confidential leave reason", { confidentialReason: "Private medical information" }],
    ["private attachment", { attachmentRef: "private://document" }],
    ["review comments", { reviewComment: "Internal reviewer note" }],
    ["internal request id", { requestId: "44444444-4444-4444-8444-444444444444" }],
  ])("rejects %s from the student DTO", (_label, privateFields) => {
    expect(PortalScheduleImpactSchema.safeParse({ ...safeImpact, ...privateFields }).success).toBe(false);
  });
});
