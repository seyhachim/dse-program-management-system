import type {
  CourseDeliveryOffering,
  CourseDeliveryResultReview,
  PublishAnnouncementInput,
  PublishAssessmentResultsInput,
  SaveAssessmentResultInput,
  SaveAssessmentCriterionScoresInput,
  SetAssessmentDeadlineInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const courseDeliveryApi = {
  offerings: () =>
    api.get<CourseDeliveryOffering[]>("/api/student-portal/manage/offerings"),
  resultReview: (offeringId: string) =>
    api.get<CourseDeliveryResultReview>(`/api/student-portal/manage/results/review/${offeringId}`),
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
