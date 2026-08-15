import type {
  CommunityActionStatus,
  CommunityActionView,
  CommunityDiscussionDetailView,
  CommunityDiscussionSummaryView,
  CommunityView,
  CreateCommunityActionInput,
  CreateCommunityDiscussionInput,
  CreateCommunityInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const communityApi = {
  list: (programmeId = "dse") =>
    api.get<CommunityView[]>(`/api/community/communities?programmeId=${encodeURIComponent(programmeId)}`),
  get: (communityId: string) =>
    api.get<CommunityView>(`/api/community/communities/${communityId}`),
  create: (input: CreateCommunityInput) =>
    api.post<CommunityView>("/api/community/communities", input),
  join: (communityId: string) =>
    api.post<void>(`/api/community/communities/${communityId}/join`, {}),
  discussions: (communityId: string) =>
    api.get<CommunityDiscussionSummaryView[]>(`/api/community/communities/${communityId}/discussions`),
  createDiscussion: (communityId: string, input: CreateCommunityDiscussionInput) =>
    api.post<CommunityDiscussionSummaryView>(`/api/community/communities/${communityId}/discussions`, input),
  discussion: (discussionId: string) =>
    api.get<CommunityDiscussionDetailView>(`/api/community/discussions/${discussionId}`),
  comment: (discussionId: string, body: string) =>
    api.post(`/api/community/discussions/${discussionId}/comments`, { body }),
  createAction: (discussionId: string, input: CreateCommunityActionInput) =>
    api.post<CommunityActionView>(`/api/community/discussions/${discussionId}/actions`, input),
  updateActionStatus: (actionId: string, status: CommunityActionStatus) =>
    api.patch<CommunityActionView>(`/api/community/actions/${actionId}/status`, { status }),
};
