import type {
  ReviewTeachingLeaveRequest,
  SubmitTeachingLeaveRequest,
  TeachingLeaveRequestView,
  TeachingLeaveReviewResult,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const teachingLeaveApi = {
  mine(): Promise<TeachingLeaveRequestView[]> {
    return api.get<TeachingLeaveRequestView[]>("/api/offerings/teaching-leave/requests/mine");
  },
  reviewQueue(): Promise<TeachingLeaveRequestView[]> {
    return api.get<TeachingLeaveRequestView[]>("/api/offerings/teaching-leave/review-queue");
  },
  get(id: string): Promise<TeachingLeaveRequestView> {
    return api.get<TeachingLeaveRequestView>(`/api/offerings/teaching-leave/requests/${id}`);
  },
  submit(input: SubmitTeachingLeaveRequest): Promise<TeachingLeaveRequestView> {
    return api.post<TeachingLeaveRequestView>("/api/offerings/teaching-leave/requests", input);
  },
  review(id: string, input: ReviewTeachingLeaveRequest): Promise<TeachingLeaveReviewResult> {
    return api.post<TeachingLeaveReviewResult>(`/api/offerings/teaching-leave/requests/${id}/review`, input);
  },
};
