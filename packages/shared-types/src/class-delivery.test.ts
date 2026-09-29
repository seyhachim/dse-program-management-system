import { describe, expect, test } from "bun:test";
import {
  ResolveTeachingSessionOccurrenceInputSchema,
  TeachingSessionOccurrenceViewSchema,
} from "./class-delivery.ts";

const OFFERING_ID = "11111111-1111-4111-8111-111111111111";
const OCCURRENCE_ID = "22222222-2222-4222-8222-222222222222";
const UUID_MEETING_ID = "33333333-3333-4333-8333-333333333333";
const LEGACY_MEETING_ID = "demo-meeting-cs101-mon";

describe("class delivery exact-occurrence contracts", () => {
  test("accepts both UUID and legacy opaque OfferingMeeting ids", () => {
    expect(
      ResolveTeachingSessionOccurrenceInputSchema.parse({
        offeringMeetingId: UUID_MEETING_ID,
        date: "2026-09-29",
      }).offeringMeetingId,
    ).toBe(UUID_MEETING_ID);

    expect(
      ResolveTeachingSessionOccurrenceInputSchema.parse({
        offeringMeetingId: LEGACY_MEETING_ID,
        date: "2026-09-28",
      }).offeringMeetingId,
    ).toBe(LEGACY_MEETING_ID);
  });

  test("rejects missing, whitespace-only, or unreasonably long meeting ids", () => {
    for (const offeringMeetingId of ["", "   ", "x".repeat(256)]) {
      expect(
        ResolveTeachingSessionOccurrenceInputSchema.safeParse({
          offeringMeetingId,
          date: "2026-09-29",
        }).success,
      ).toBe(false);
    }
  });

  test("keeps offering and occurrence ids UUID-scoped while preserving a legacy meeting id", () => {
    const view = TeachingSessionOccurrenceViewSchema.parse({
      id: OCCURRENCE_ID,
      offeringId: OFFERING_ID,
      offeringMeetingId: LEGACY_MEETING_ID,
      date: "2026-09-28",
      scheduledDayOfWeek: "Monday",
      scheduledStartTime: "09:00",
      scheduledEndTime: "10:30",
      scheduledRoom: null,
      scheduledActivityType: "Lecture",
      createdAt: "2026-09-28T02:00:00.000Z",
      updatedAt: "2026-09-28T02:00:00.000Z",
    });

    expect(view.offeringMeetingId).toBe(LEGACY_MEETING_ID);

    expect(
      TeachingSessionOccurrenceViewSchema.safeParse({
        ...view,
        id: "legacy-occurrence-id",
      }).success,
    ).toBe(false);

    expect(
      TeachingSessionOccurrenceViewSchema.safeParse({
        ...view,
        offeringId: "legacy-offering-id",
      }).success,
    ).toBe(false);
  });
});
