import { expect, test } from "bun:test";
import {
  ReviewUnassignedTeachingRequestSchema,
  SubmitUnassignedTeachingRequestSchema,
  UnassignedTeachingRequestStatusSchema,
} from "./unassigned-teaching.ts";

test("teaching assignment request accepts only an exact meeting id", () => {
  const meetingId = "11111111-1111-4111-8111-111111111111";
  expect(SubmitUnassignedTeachingRequestSchema.parse({ meetingId })).toEqual({ meetingId });
  expect(SubmitUnassignedTeachingRequestSchema.safeParse({ meetingId: "not-a-uuid" }).success).toBe(false);
  expect(SubmitUnassignedTeachingRequestSchema.safeParse({ meetingId, offeringId: "extra" }).success).toBe(false);
});

test("teaching assignment review is approve or reject with bounded optional comment", () => {
  expect(ReviewUnassignedTeachingRequestSchema.parse({ decision: "APPROVE" })).toEqual({ decision: "APPROVE" });
  expect(
    ReviewUnassignedTeachingRequestSchema.parse({ decision: "REJECT", comment: "  Timetable conflict  " }),
  ).toEqual({ decision: "REJECT", comment: "Timetable conflict" });
  expect(ReviewUnassignedTeachingRequestSchema.safeParse({ decision: "REQUEST_CHANGES" }).success).toBe(false);
  expect(ReviewUnassignedTeachingRequestSchema.safeParse({ decision: "REJECT", comment: "x".repeat(1501) }).success).toBe(false);
});

test("request status distinguishes reviewed and competing-request outcomes", () => {
  for (const status of ["PENDING", "APPROVED", "REJECTED", "SUPERSEDED"]) {
    expect(UnassignedTeachingRequestStatusSchema.parse(status)).toBe(status);
  }
});
