import { describe, expect, test } from "bun:test";
import {
  ReviseTeachingLeaveRequestSchema,
  ReviewTeachingLeaveRequestSchema,
  SubmitTeachingLeaveRequestSchema,
  TeachingLeaveOperationalImpactSchema,
  TeachingLeaveRequestViewSchema,
} from "./teaching-leave.ts";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

describe("teaching leave contracts", () => {
  test("requires an exact occurrence reference and rejects duplicate sessions", () => {
    const occurrence = {
      offeringId: id,
      offeringMeetingId: otherId,
      date: "2026-09-14",
      releaseForReuse: true,
    };
    const result = SubmitTeachingLeaveRequestSchema.safeParse({
      occurrences: [occurrence, occurrence],
      leaveType: "PERSONAL",
      confidentialReason: "private",
      proposedHandling: "OPEN_SLOT",
    });
    expect(result.success).toBe(false);
  });

  test("requester revision keeps exact-session scope out of the editable contract", () => {
    const valid = ReviseTeachingLeaveRequestSchema.safeParse({
      leaveType: "OFFICIAL_DUTY",
      confidentialReason: "Updated private reason",
      proposedHandling: "MAKE_UP",
      proposedNote: "Updated recovery plan",
    });
    expect(valid.success).toBe(true);

    const withOccurrenceMutation = ReviseTeachingLeaveRequestSchema.safeParse({
      leaveType: "OFFICIAL_DUTY",
      confidentialReason: "Updated private reason",
      proposedHandling: "MAKE_UP",
      occurrences: [{
        offeringId: id,
        offeringMeetingId: otherId,
        date: "2026-09-21",
        releaseForReuse: false,
      }],
    });
    expect(withOccurrenceMutation.success).toBe(false);
  });

  test("request changes requires reviewer guidance", () => {
    expect(ReviewTeachingLeaveRequestSchema.safeParse({ decision: "REQUEST_CHANGES" }).success).toBe(false);
    expect(ReviewTeachingLeaveRequestSchema.safeParse({
      decision: "REQUEST_CHANGES",
      comment: "Please clarify the recovery plan.",
    }).success).toBe(true);
  });

  test("safe operational impact rejects confidential leave fields", () => {
    const safe = {
      requestId: id,
      occurrenceId: otherId,
      offeringId: "33333333-3333-4333-8333-333333333333",
      programmeId: "dse",
      courseCode: "DSE301",
      courseTitle: "Data Science",
      sectionCode: "A",
      sessionDate: "2026-09-14",
      startTime: "08:00",
      endTime: "10:00",
      room: "301",
      releaseForReuse: true,
      proposedHandling: "OPEN_SLOT",
    };
    expect(TeachingLeaveOperationalImpactSchema.safeParse(safe).success).toBe(true);
    expect(TeachingLeaveOperationalImpactSchema.safeParse({ ...safe, confidentialReason: "medical details" }).success).toBe(false);
    expect(TeachingLeaveOperationalImpactSchema.safeParse({ ...safe, attachmentRef: "private-file" }).success).toBe(false);
    expect(TeachingLeaveOperationalImpactSchema.safeParse({ ...safe, reviewComment: "internal" }).success).toBe(false);
  });

  test("private requester/manager view keeps confidential fields explicit", () => {
    const parsed = TeachingLeaveRequestViewSchema.parse({
      id,
      programmeId: "dse",
      requester: { id: otherId, name: "Lecturer" },
      leaveType: "SICK",
      confidentialReason: "confidential",
      attachmentRef: null,
      proposedHandling: "MAKE_UP",
      proposedNote: "Recover next week",
      noticeHours: 24,
      submittedLate: false,
      status: "PENDING",
      reviewedBy: null,
      reviewedAt: null,
      reviewComment: "",
      submittedAt: "2026-09-09T01:00:00.000Z",
      updatedAt: "2026-09-09T01:00:00.000Z",
      occurrences: [{
        occurrenceId: "33333333-3333-4333-8333-333333333333",
        offeringId: "44444444-4444-4444-8444-444444444444",
        offeringMeetingId: "55555555-5555-4555-8555-555555555555",
        sessionDate: "2026-09-14",
        scheduledDayOfWeek: "Monday",
        scheduledStartTime: "08:00",
        scheduledEndTime: "10:00",
        scheduledRoom: null,
        scheduledActivityType: "Lecture",
        releaseForReuse: false,
        course: { code: "DSE301", title: "Data Science" },
        sectionCode: "A",
      }],
    });
    expect(parsed.confidentialReason).toBe("confidential");
  });
});
