import type {
  CourseDeliveryOffering,
  PublishAnnouncementInput,
  PublishAssessmentResultInput,
  SetAssessmentDeadlineInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const courseDeliveryApi = {
  offerings: () =>
    api.get<CourseDeliveryOffering[]>("/api/student-portal/manage/offerings"),
  publishAnnouncement: (input: PublishAnnouncementInput) =>
    api.post("/api/student-portal/manage/announcements", input),
  setDeadline: (input: SetAssessmentDeadlineInput) =>
    api.put("/api/student-portal/manage/deadlines", input),
  publishResult: (input: PublishAssessmentResultInput) =>
    api.put("/api/student-portal/manage/results", input),
};

export function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
