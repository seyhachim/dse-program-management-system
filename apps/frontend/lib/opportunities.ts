import type {
  CreateOpportunityInput, OpportunityDetailView, OpportunityExperienceReviewView,
  OpportunityView, OwnOpportunityExperienceView, SubmitOpportunityExperienceInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

const base = "/api/opportunities";
export const opportunitiesApi = {
  list: () => api.get<OpportunityView[]>(base),
  detail: (id: string) => api.get<OpportunityDetailView>(base + "/" + encodeURIComponent(id)),
  manage: () => api.get<OpportunityView[]>(base + "/manage"),
  create: (input: CreateOpportunityInput) => api.post<OpportunityView>(base + "/manage", input),
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
  reviewExperience: (id: string, action: "approve" | "hide") =>
    api.post<{ id: string; status: string }>(base + "/manage/experiences/" + encodeURIComponent(id) + "/" + action, {}),
};
