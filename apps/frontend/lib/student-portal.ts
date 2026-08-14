import type {
  CourseFeedbackInput,
  PortalAnnouncement,
  PortalCourseDetail,
  PortalCourseSummary,
  StudentPortalHome,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const studentPortalApi = {
  home: () => api.get<StudentPortalHome>("/api/student-portal/home"),
  courses: () => api.get<PortalCourseSummary[]>("/api/student-portal/courses"),
  course: (offeringId: string) =>
    api.get<PortalCourseDetail>(`/api/student-portal/courses/${offeringId}`),
  announcements: () =>
    api.get<PortalAnnouncement[]>("/api/student-portal/announcements"),
  submitFeedback: (offeringId: string, input: CourseFeedbackInput) =>
    api.post<{ submitted: true }>(`/api/student-portal/courses/${offeringId}/feedback`, input),
};

export function assessmentDeadline(dueAt: string | null, dueWeek: number | null): string {
  if (dueAt) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(dueAt));
  }
  return dueWeek ? `Due in Week ${dueWeek}` : "Deadline to be announced";
}

export function meetingLabel(meeting: PortalCourseSummary["meetings"][number]): string {
  return `${meeting.dayOfWeek} · ${meeting.startTime}–${meeting.endTime}`;
}
