import type {
  ApplyStudentPromotionInput,
  PreviewStudentPromotionInput,
  StudentCohortSummaryView,
  StudentPromotionApplyResult,
  StudentPromotionPreview,
} from "@dse-pms/shared-types";
import { api } from "./api";

const COHORTS_API = "/api/students/cohorts";

export const studentCohortsApi = {
  list(programmeId: string): Promise<StudentCohortSummaryView[]> {
    const qs = new URLSearchParams({ programmeId });
    return api.get<StudentCohortSummaryView[]>(`${COHORTS_API}?${qs.toString()}`);
  },

  previewPromotion(cohortId: string, input: PreviewStudentPromotionInput): Promise<StudentPromotionPreview> {
    return api.post<StudentPromotionPreview>(`${COHORTS_API}/${cohortId}/promotion/preview`, input);
  },

  applyPromotion(cohortId: string, input: ApplyStudentPromotionInput): Promise<StudentPromotionApplyResult> {
    return api.post<StudentPromotionApplyResult>(`${COHORTS_API}/${cohortId}/promotion/apply`, input);
  },
};
