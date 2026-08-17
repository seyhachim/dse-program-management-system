import {
  FinalizedResultCorrectionHistorySchema,
  FinalizedResultCorrectionWorkspaceSchema,
  type CorrectFinalizedAssessmentResultInput,
  type CorrectFinalizedAssessmentResultResponse,
  type CourseDeliveryOffering,
  type CourseDeliveryResultReview,
  type OfferingResultAccessPolicy,
  type PublishAnnouncementInput,
  type PublishAssessmentResultsInput,
  type SaveAssessmentResultInput,
  type SaveAssessmentCriterionScoresInput,
  type SetAssessmentDeadlineInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const courseDeliveryApi = {
  offerings: () =>
    api.get<CourseDeliveryOffering[]>("/api/student-portal/manage/offerings"),
  resultReview: (offeringId: string) =>
    api.get<CourseDeliveryResultReview>(`/api/student-portal/manage/results/review/${offeringId}`),
  correctionWorkspace: (offeringId: string) =>
    api.get<unknown>(`/api/student-portal/manage/results/corrections/${offeringId}`)
      .then((data) => FinalizedResultCorrectionWorkspaceSchema.parse(data)),
  correctionHistory: (assessmentResultId: string) =>
    api.get<unknown>(`/api/student-portal/manage/results/${assessmentResultId}/corrections`)
      .then((data) => FinalizedResultCorrectionHistorySchema.parse(data)),
  correctFinalizedResult: (input: CorrectFinalizedAssessmentResultInput) =>
    api.post<CorrectFinalizedAssessmentResultResponse>(
      "/api/student-portal/manage/results/correct",
      input,
    ),
  resultAccessPolicy: (offeringId: string) =>
    api.get<OfferingResultAccessPolicy>(`/api/student-portal/manage/offerings/${offeringId}/result-access`),
  setResultAccessPolicy: (offeringId: string, requireSurveyBeforeResults: boolean) =>
    api.put<OfferingResultAccessPolicy>(`/api/student-portal/manage/offerings/${offeringId}/result-access`, {
      requireSurveyBeforeResults,
    }),
  publishAnnouncement: (input: PublishAnnouncementInput) =>
    api.post("/api/student-portal/manage/announcements", input),
  setDeadline: (input: SetAssessmentDeadlineInput) =>
    api.put("/api/student-portal/manage/deadlines", input),
  saveResult: (input: SaveAssessmentResultInput) =>
    api.put("/api/student-portal/manage/results", input),
  saveCriterionScores: (input: SaveAssessmentCriterionScoresInput) =>
    api.put("/api/student-portal/manage/results/criteria", input),
  publishAssessmentResults: (input: PublishAssessmentResultsInput) =>
    api.post("/api/student-portal/manage/results/publish", input),
};

export function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
