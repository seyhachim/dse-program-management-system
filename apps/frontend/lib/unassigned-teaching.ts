import type {
  ReviewUnassignedTeachingRequest,
  UnassignedTeachingMeetingView,
  UnassignedTeachingRequestView,
  UnassignedTeachingReviewResult,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const unassignedTeachingApi = {
  available(): Promise<UnassignedTeachingMeetingView[]> {
    return api.get("/api/offerings/unassigned-teaching/available");
  },
  mine(): Promise<UnassignedTeachingRequestView[]> {
    return api.get("/api/offerings/unassigned-teaching/requests/mine");
  },
  submit(meetingId: string): Promise<UnassignedTeachingRequestView> {
    return api.post("/api/offerings/unassigned-teaching/requests", { meetingId });
  },
  reviewQueue(): Promise<UnassignedTeachingRequestView[]> {
    return api.get("/api/offerings/unassigned-teaching/review-queue");
  },
  review(
    requestId: string,
    input: ReviewUnassignedTeachingRequest,
  ): Promise<UnassignedTeachingReviewResult> {
    return api.post(
      `/api/offerings/unassigned-teaching/requests/${encodeURIComponent(requestId)}/review`,
      input,
    );
  },
};
