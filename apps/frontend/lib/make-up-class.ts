import type {
  ApprovedMakeUpAttendanceDate, MakeUpClassView, ProposeMakeUpClass, ReviewMakeUpClass,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const makeUpClassApi = {
  mine(): Promise<MakeUpClassView[]> {
    return api.get<MakeUpClassView[]>("/api/offerings/make-up/mine");
  },
  reviewQueue(): Promise<MakeUpClassView[]> {
    return api.get<MakeUpClassView[]>("/api/offerings/make-up/review-queue");
  },
  approvedForDate(date: string): Promise<ApprovedMakeUpAttendanceDate[]> {
    return api.get<ApprovedMakeUpAttendanceDate[]>(`/api/offerings/make-up/approved?date=${encodeURIComponent(date)}`);
  },
  propose(input: ProposeMakeUpClass): Promise<MakeUpClassView> {
    return api.post<MakeUpClassView>("/api/offerings/make-up", input);
  },
  review(id: string, input: ReviewMakeUpClass): Promise<MakeUpClassView> {
    return api.post<MakeUpClassView>(`/api/offerings/make-up/${encodeURIComponent(id)}/review`, input);
  },
};
