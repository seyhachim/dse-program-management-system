import type {
  CreateOpportunityInput, UpdateOpportunityInput, OpportunityDetailView, OpportunityExperienceReviewView,
  OpportunityView, OwnOpportunityExperienceView, SubmitOpportunityExperienceInput,
  OpportunityInterestSummary, OpportunityInterestOverviewItem, OpportunityInterestedStudent,
} from "@dse-pms/shared-types";
import { api } from "./api";

const base = "/api/opportunities";
export const opportunitiesApi = {
  list: () => api.get<OpportunityView[]>(base),
  detail: (id: string) => api.get<OpportunityDetailView>(base + "/" + encodeURIComponent(id)),
  manage: () => api.get<OpportunityView[]>(base + "/manage"),
  interest: (id: string) => api.get<OpportunityInterestSummary>(base + "/" + encodeURIComponent(id) + "/interest"),
  joinInterest: (id: string) => api.post<OpportunityInterestSummary>(base + "/" + encodeURIComponent(id) + "/interest", {}),
  withdrawInterest: (id: string) => api.post<OpportunityInterestSummary>(base + "/" + encodeURIComponent(id) + "/interest/withdraw", {}),
  interestOverview: () => api.get<OpportunityInterestOverviewItem[]>(base + "/participation"),
  interestStudents: (id: string) => api.get<OpportunityInterestedStudent[]>(base + "/" + encodeURIComponent(id) + "/interest/students"),
  create: (input: CreateOpportunityInput) => api.post<OpportunityView>(base + "/manage", input),
  update: (id: string, input: UpdateOpportunityInput) =>
    api.patch<OpportunityView>(base + "/manage/" + encodeURIComponent(id), input),
  restore: (id: string) =>
    api.post<OpportunityView>(base + "/manage/" + encodeURIComponent(id) + "/restore", {}),
  uploadPoster: (id: string, file: File) =>
    api.uploadFile<OpportunityView>(base + "/manage/" + encodeURIComponent(id) + "/poster", file),
  publish: (id: string) => api.post<OpportunityView>(base + "/manage/" + encodeURIComponent(id) + "/publish", {}),
  archive: (id: string) => api.post<OpportunityView>(base + "/manage/" + encodeURIComponent(id) + "/archive", {}),
  myExperiences: (id: string) =>
    api.get<OwnOpportunityExperienceView[]>(base + "/" + encodeURIComponent(id) + "/my-experiences"),
  withdrawExperience: (id: string, experienceId: string) =>
    api.post<{ id: string; status: string }>(
      base + "/" + encodeURIComponent(id) + "/experiences/" + encodeURIComponent(experienceId) + "/withdraw", {},
    ),
  submitExperience: (id: string, input: SubmitOpportunityExperienceInput) =>
    api.post<{ id: string; status: string }>(base + "/" + encodeURIComponent(id) + "/experiences", input),
  pendingExperiences: () => api.get<OpportunityExperienceReviewView[]>(base + "/manage/experiences"),
  reviewExperience: (id: string, action: "approve" | "hide", reason = "") =>
    api.post<{ id: string; status: string }>(base + "/manage/experiences/" + encodeURIComponent(id) + "/" + action, { reason }),
};
