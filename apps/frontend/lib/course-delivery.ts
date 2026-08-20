import {
  FinalizedResultCorrectionHistorySchema,
  FinalizedResultCorrectionWorkspaceSchema,
  type CorrectAssessmentGroupScoreInput,
  type CorrectAssessmentIndividualComponentInput,
  type CorrectFinalizedAssessmentResultInput,
  type CorrectFinalizedAssessmentResultResponse,
  type CourseDeliveryOffering,
  type CourseDeliveryResultReview,
  type FinalizeAssessmentResultsInput,
  type GroupAssessmentWorkspace,
  type OfferingResultAccessPolicy,
  type PublishAnnouncementInput,
  type PublishAssessmentResultsInput,
  type SaveAssessmentGroupScoreInput,
  type SaveAssessmentGroupsInput,
  type SaveAssessmentIndividualComponentInput,
  type SaveAssessmentResultInput,
  type SaveAssessmentCriterionScoresInput,
  type SaveAssessmentSourceCriterionScoresInput,
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
  finalizeAssessmentResults: (input: FinalizeAssessmentResultsInput) =>
    api.post("/api/student-portal/manage/results/finalize", input),

  groupWorkspace: (offeringId: string, assessmentItemId: string) =>
    api.get<GroupAssessmentWorkspace>(
      `/api/student-portal/manage/offerings/${offeringId}/assessments/${assessmentItemId}/groups`,
    ),
  saveGroups: (offeringId: string, assessmentItemId: string, input: SaveAssessmentGroupsInput) =>
    api.put<GroupAssessmentWorkspace>(
      `/api/student-portal/manage/offerings/${offeringId}/assessments/${assessmentItemId}/groups`,
      input,
    ),
  saveGroupScore: (
    offeringId: string,
    assessmentItemId: string,
    groupId: string,
    input: SaveAssessmentGroupScoreInput,
  ) => api.put<GroupAssessmentWorkspace>(
    `/api/student-portal/manage/offerings/${offeringId}/assessments/${assessmentItemId}/groups/${groupId}/score`,
    input,
  ),
  saveGroupCriteria: (
    offeringId: string,
    assessmentItemId: string,
    groupId: string,
    input: SaveAssessmentSourceCriterionScoresInput,
  ) => api.put<GroupAssessmentWorkspace>(
    `/api/student-portal/manage/offerings/${offeringId}/assessments/${assessmentItemId}/groups/${groupId}/criteria`,
    input,
  ),
  saveIndividualComponent: (
    offeringId: string,
    assessmentItemId: string,
    enrollmentId: string,
    input: SaveAssessmentIndividualComponentInput,
  ) => api.put<GroupAssessmentWorkspace>(
    `/api/student-portal/manage/offerings/${offeringId}/assessments/${assessmentItemId}/students/${enrollmentId}/individual`,
    input,
  ),
  saveIndividualCriteria: (
    offeringId: string,
    assessmentItemId: string,
    enrollmentId: string,
    input: SaveAssessmentSourceCriterionScoresInput,
  ) => api.put<GroupAssessmentWorkspace>(
    `/api/student-portal/manage/offerings/${offeringId}/assessments/${assessmentItemId}/students/${enrollmentId}/individual/criteria`,
    input,
  ),
  correctGroupScore: (
    offeringId: string,
    assessmentItemId: string,
    groupId: string,
    input: CorrectAssessmentGroupScoreInput,
  ) => api.post<GroupAssessmentWorkspace>(
    `/api/student-portal/manage/offerings/${offeringId}/assessments/${assessmentItemId}/groups/${groupId}/correct`,
    input,
  ),
  correctIndividualComponent: (
    offeringId: string,
    assessmentItemId: string,
    enrollmentId: string,
    input: CorrectAssessmentIndividualComponentInput,
  ) => api.post<GroupAssessmentWorkspace>(
    `/api/student-portal/manage/offerings/${offeringId}/assessments/${assessmentItemId}/students/${enrollmentId}/individual/correct`,
    input,
  ),
};

export function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
