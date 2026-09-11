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

export interface PortalCourseAchievementSummary {
  offeringId: string;
  eligibleAttendanceSessions: number;
  achievementAttendanceRate: number | null;
  finalizedCourseGrade: number | null;
  badges: PortalCourseAchievementBadge[];
}
