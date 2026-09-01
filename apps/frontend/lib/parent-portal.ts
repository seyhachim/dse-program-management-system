import type { GuardianAccessScope, GuardianLinkedStudentView } from "@dse-pms/shared-types";
import { api } from "./api";

export const parentPortalApi = {
  linkedStudents: () =>
    api.get<GuardianLinkedStudentView[]>("/api/guardian-relationships/me"),
};

const SCOPE_LABELS: Record<GuardianAccessScope, string> = {
  attendance: "Attendance",
  academic_status: "Academic status",
  official_results: "Official results",
  announcements: "Programme notices",
  academic_calendar: "Academic calendar",
  support_cases: "Student support",
  meeting_requests: "Meeting requests",
  parent_feedback: "Parent feedback",
};

export function guardianScopeLabel(scope: GuardianAccessScope): string {
  return SCOPE_LABELS[scope];
}

export function relationshipLabel(type: GuardianLinkedStudentView["relationshipType"]): string {
  switch (type) {
    case "MOTHER": return "Mother";
    case "FATHER": return "Father";
    case "LEGAL_GUARDIAN": return "Legal guardian";
    case "OTHER_AUTHORIZED_GUARDIAN": return "Authorized guardian";
  }
}
