import type {
  ApplyStudentPromotionInput,
  PreviewStudentPromotionInput,
  StudentCohortSummaryView,
  StudentPromotionApplyResult,
  StudentPromotionPreview,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const studentCohortsApi = {
  list(programmeId: string): Promise<StudentCohortSummaryView[]> {
    const qs = new URLSearchParams({ programmeId });
    return api.get<StudentCohortSummaryView[]>(`/api/student-cohorts?${qs.toString()}`);
  },

  previewPromotion(cohortId: string, input: PreviewStudentPromotionInput): Promise<StudentPromotionPreview> {
    return api.post<StudentPromotionPreview>(`/api/student-cohorts/${cohortId}/promotion/preview`, input);
  },

  applyPromotion(cohortId: string, input: ApplyStudentPromotionInput): Promise<StudentPromotionApplyResult> {
    return api.post<StudentPromotionApplyResult>(`/api/student-cohorts/${cohortId}/promotion/apply`, input);
  },
};
