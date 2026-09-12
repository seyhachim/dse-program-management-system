import type { AttendanceStatus } from "./attendance.ts";

export const PORTAL_COURSE_ACHIEVEMENT_KINDS = [
  "great_start",
  "reliable_learner",
  "perfect_attendance",
  "strong_performance",
  "course_excellence",
] as const;

export type PortalCourseAchievementKind =
  (typeof PORTAL_COURSE_ACHIEVEMENT_KINDS)[number];

export interface PortalCourseAchievementBadge {
  kind: PortalCourseAchievementKind;
  title: string;
  achieved: boolean;
  progress: number;
  detail: string;
}

export interface PortalCourseAttendanceSession {
  date: string;
  status: AttendanceStatus | null;
  permissionPending: boolean;
}

export interface PortalCourseAttendanceSummary {
  totalSessions: number;
  markedSessions: number;
  attendanceRate: number | null;
  sessions: PortalCourseAttendanceSession[];
}

export interface PortalCourseAchievementSummary {
  offeringId: string;
  eligibleAttendanceSessions: number;
  achievementAttendanceRate: number | null;
  finalizedCourseGrade: number | null;
  attendance: PortalCourseAttendanceSummary;
  badges: PortalCourseAchievementBadge[];
}
