import type {
  CourseFeedbackInput,
  PortalAnnouncement,
  PortalAssessmentOverview,
  PortalCourseDetail,
  PortalCourseDocumentDownload,
  PortalCourseSummary,
  STUDENT_PORTAL_TIME_ZONE,
  StudentPortalHome,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const studentPortalApi = {
  home: () => api.get<StudentPortalHome>("/api/student-portal/home"),
  courses: () => api.get<PortalCourseSummary[]>("/api/student-portal/courses"),
  course: (offeringId: string) =>
    api.get<PortalCourseDetail>(`/api/student-portal/courses/${offeringId}`),
  assessments: () =>
    api.get<PortalAssessmentOverview[]>("/api/student-portal/assessments"),
  courseDocument: (offeringId: string) =>
    api.get<PortalCourseDocumentDownload>(`/api/student-portal/courses/${offeringId}/document`),
  announcements: () =>
    api.get<PortalAnnouncement[]>("/api/student-portal/announcements"),
  submitFeedback: (offeringId: string, input: CourseFeedbackInput) =>
    api.post<{ submitted: true }>(`/api/student-portal/courses/${offeringId}/feedback`, input),
};

export function assessmentDeadline(dueAt: string | null, dueWeek: number | null): string {
  if (dueAt) {
    return `${new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: STUDENT_PORTAL_TIME_ZONE,
    }).format(new Date(dueAt))} (Cambodia time)`;
  }
  return dueWeek ? `Due in Week ${dueWeek}` : "Deadline to be announced";
}

export function meetingLabel(meeting: PortalCourseSummary["meetings"][number]): string {
  return `${meeting.dayOfWeek} · ${meeting.startTime}–${meeting.endTime}`;
}

export async function downloadApprovedCourseDocument(offeringId: string): Promise<void> {
  const document = await studentPortalApi.courseDocument(offeringId);
  const blob = new Blob([document.content], { type: document.contentType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = document.fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
