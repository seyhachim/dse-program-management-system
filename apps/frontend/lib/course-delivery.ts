import type {
  CourseDeliveryOffering,
  PublishAnnouncementInput,
  PublishAssessmentResultsInput,
  SaveAssessmentResultInput,
  SetAssessmentDeadlineInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export type OfferingResultAccessPolicy = {
  offeringId: string;
  requireSurveyBeforeResults: boolean;
};

export const courseDeliveryApi = {
  offerings: () =>
    api.get<CourseDeliveryOffering[]>("/api/student-portal/manage/offerings"),
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
  publishAssessmentResults: (input: PublishAssessmentResultsInput) =>
    api.post("/api/student-portal/manage/results/publish", input),
};

export function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
