import type {
  PublicQuestionEventList,
  PublicQuestionFaqDraftResult,
  PublicQuestionReviewState,
} from "@dse-pms/shared-types";
import { api } from "./api";

function base(programmeId: string): string {
  return `/api/programme/public-information/programmes/${encodeURIComponent(programmeId)}/question-events`;
}

export const publicQuestionAnalyticsApi = {
  list(programmeId: string, filters?: { state?: PublicQuestionReviewState; q?: string }) {
    const params = new URLSearchParams();
    if (filters?.state) params.set("state", filters.state);
    if (filters?.q?.trim()) params.set("q", filters.q.trim());
    const query = params.toString();
    return api.get<PublicQuestionEventList>(`${base(programmeId)}${query ? `?${query}` : ""}`);
  },

  setReviewState(programmeId: string, eventId: string, state: PublicQuestionReviewState) {
    return api.patch<void>(`${base(programmeId)}/${encodeURIComponent(eventId)}`, { state });
  },

  createFaqDraft(programmeId: string, eventId: string) {
    return api.post<PublicQuestionFaqDraftResult>(
      `${base(programmeId)}/${encodeURIComponent(eventId)}/faq-draft`,
      {},
    );
  },
};
