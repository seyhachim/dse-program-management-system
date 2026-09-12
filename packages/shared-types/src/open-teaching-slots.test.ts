import { describe, expect, test } from "bun:test";
import {
  OpenTeachingSlotClaimViewSchema,
  OpenTeachingSlotStudentAssignmentSchema,
  OpenTeachingSlotViewSchema,
  ReviewOpenTeachingSlotClaimSchema,
  SubmitOpenTeachingSlotClaimSchema,
} from "./open-teaching-slots.ts";

const slot = {
  id: "11111111-1111-4111-8111-111111111111",
  programmeId: "dse",
  status: "OPEN" as const,
  sourceOccurrenceId: "22222222-2222-4222-8222-222222222222",
  sessionDate: "2026-09-14",
  startTime: "08:00",
  endTime: "10:00",
  room: "306",
  activityType: "Lecture",
  sourceCourseCode: "TSA301",
  sourceCourseTitle: "Time Series Analysis",
  sectionCode: "M1",
  eligibleOfferings: [{
    offeringId: "33333333-3333-4333-8333-333333333333",
    courseCode: "DSS301",
    courseTitle: "Data Science for Smart Agriculture",
    sectionCode: "M1",
    term: "2026-S1",
  }],
};

const claim = {
  id: "44444444-4444-4444-8444-444444444444",
  slotId: slot.id,
  status: "REQUESTED" as const,
  claimant: {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Eligible Lecturer",
  },
  targetOffering: slot.eligibleOfferings[0]!,
  slot: {
    sessionDate: slot.sessionDate,
    startTime: slot.startTime,
    endTime: slot.endTime,
    room: slot.room,
    sourceCourseCode: slot.sourceCourseCode,
    sourceCourseTitle: slot.sourceCourseTitle,
    sectionCode: slot.sectionCode,
  },
  reviewedBy: null,
  reviewedAt: null,
  reviewComment: "",
  requestedAt: "2026-09-11T10:00:00.000Z",
  confirmedOccurrenceId: null,
};

const studentAssignment = {
  occurrenceId: "66666666-6666-4666-8666-666666666666",
  slotId: slot.id,
  offeringId: slot.eligibleOfferings[0]!.offeringId,
  courseCode: slot.eligibleOfferings[0]!.courseCode,
  courseTitle: slot.eligibleOfferings[0]!.courseTitle,
  sectionCode: slot.sectionCode,
  lecturerName: "Eligible Lecturer",
  sessionDate: slot.sessionDate,
  startTime: slot.startTime,
  endTime: slot.endTime,
  room: slot.room,
  activityType: slot.activityType,
  kind: "reused-slot" as const,
};

describe("open teaching slot contracts", () => {
  test("accepts the operational lecturer board projection", () => {
    expect(OpenTeachingSlotViewSchema.parse(slot)).toEqual(slot);
  });

  test.each([
    ["confidential leave reason", { confidentialReason: "Private medical information" }],
    ["private attachment", { attachmentRef: "private://leave-document" }],
    ["source leave request id", { sourceLeaveRequestId: "77777777-7777-4777-8777-777777777777" }],
    ["leave reviewer comment", { leaveReviewComment: "Internal leave review note" }],
  ])("rejects %s from the lecturer board DTO", (_label, privateFields) => {
    expect(OpenTeachingSlotViewSchema.safeParse({ ...slot, ...privateFields }).success).toBe(false);
  });

  test("keeps the claim DTO operational and strict", () => {
    expect(OpenTeachingSlotClaimViewSchema.parse(claim)).toEqual(claim);
    expect(OpenTeachingSlotClaimViewSchema.safeParse({
      ...claim,
      confidentialReason: "do not expose",
    }).success).toBe(false);
  });

  test("keeps the student assignment separate from leave and claim review data", () => {
    expect(OpenTeachingSlotStudentAssignmentSchema.parse(studentAssignment)).toEqual(studentAssignment);
    expect(OpenTeachingSlotStudentAssignmentSchema.safeParse({
      ...studentAssignment,
      sourceCourseCode: "TSA301",
    }).success).toBe(false);
    expect(OpenTeachingSlotStudentAssignmentSchema.safeParse({
      ...studentAssignment,
      reviewComment: "internal note",
    }).success).toBe(false);
  });

  test("claim and review inputs reject unexpected fields", () => {
    expect(SubmitOpenTeachingSlotClaimSchema.safeParse({
      targetOfferingId: slot.eligibleOfferings[0]!.offeringId,
    }).success).toBe(true);
    expect(SubmitOpenTeachingSlotClaimSchema.safeParse({
      targetOfferingId: slot.eligibleOfferings[0]!.offeringId,
      reason: "extra data",
    }).success).toBe(false);
    expect(ReviewOpenTeachingSlotClaimSchema.safeParse({ decision: "APPROVE" }).success).toBe(true);
    expect(ReviewOpenTeachingSlotClaimSchema.safeParse({ decision: "APPROVE", confidentialReason: "no" }).success).toBe(false);
  });
});
