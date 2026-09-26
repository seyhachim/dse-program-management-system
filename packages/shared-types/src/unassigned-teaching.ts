import { z } from "zod";
import type { MeetingActivityType, MeetingDay } from "./offerings.ts";

export const UnassignedTeachingRequestStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
]);
export type UnassignedTeachingRequestStatus = z.infer<typeof UnassignedTeachingRequestStatusSchema>;

export const SubmitUnassignedTeachingRequestSchema = z.object({
  meetingId: z.string().uuid(),
}).strict();
export type SubmitUnassignedTeachingRequest = z.infer<typeof SubmitUnassignedTeachingRequestSchema>;

export const ReviewUnassignedTeachingRequestSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(1500).optional(),
}).strict();
export type ReviewUnassignedTeachingRequest = z.infer<typeof ReviewUnassignedTeachingRequestSchema>;

export interface UnassignedTeachingMeetingView {
  meetingId: string;
  offeringId: string;
  programmeId: string;
  course: {
    id: string;
    code: string;
    title: string;
  };
  term: string;
  sectionCode: string;
  offeringStatus: "Planned" | "Active" | "Completed";
  academicCalendarPeriodId: string | null;
  dayOfWeek: MeetingDay;
  startTime: string;
  endTime: string;
  building: string | null;
  room: string | null;
  activityType: MeetingActivityType;
}

export interface UnassignedTeachingRequestView {
  id: string;
  status: UnassignedTeachingRequestStatus;
  requester: {
    id: string;
    name: string;
  };
  meeting: UnassignedTeachingMeetingView;
  requestedAt: string;
  updatedAt: string;
  reviewedBy: {
    id: string;
    name: string;
  } | null;
  reviewedAt: string | null;
  reviewComment: string | null;
}

export interface UnassignedTeachingReviewResult {
  request: UnassignedTeachingRequestView;
  changed: boolean;
}
