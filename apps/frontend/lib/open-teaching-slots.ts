import type {
  OpenTeachingSlotClaimReviewResult,
  OpenTeachingSlotClaimView,
  OpenTeachingSlotStudentAssignment,
  OpenTeachingSlotView,
  ReviewOpenTeachingSlotClaim,
  SubmitOpenTeachingSlotClaim,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const openTeachingSlotApi = {
  board: () => api.get<OpenTeachingSlotView[]>("/api/offerings/open-teaching-slots"),
  mine: () => api.get<OpenTeachingSlotClaimView[]>("/api/offerings/open-teaching-slots/claims/mine"),
  claim: (slotId: string, input: SubmitOpenTeachingSlotClaim) =>
    api.post<OpenTeachingSlotClaimView>(`/api/offerings/open-teaching-slots/${slotId}/claims`, input),
  withdraw: (claimId: string) =>
    api.post<OpenTeachingSlotClaimView>(`/api/offerings/open-teaching-slots/claims/${claimId}/withdraw`, {}),
  reviewQueue: () =>
    api.get<OpenTeachingSlotClaimView[]>("/api/offerings/open-teaching-slots/review-queue"),
  review: (claimId: string, input: ReviewOpenTeachingSlotClaim) =>
    api.post<OpenTeachingSlotClaimReviewResult>(`/api/offerings/open-teaching-slots/claims/${claimId}/review`, input),
  studentAssignments: () =>
    api.get<OpenTeachingSlotStudentAssignment[]>("/api/student-portal/open-slot-assignments"),
};
