import { z } from "zod";

export const TelegramAssessmentDeadlineSchema = z.object({
  offeringId: z.string(),
  courseCode: z.string(),
  courseTitle: z.string(),
  sectionCode: z.string(),
  assessmentId: z.string(),
  name: z.string(),
  dueAt: z.string().datetime().nullable(),
  dueWeek: z.number().int().positive().nullable(),
  weight: z.number().nullable(),
});
export type TelegramAssessmentDeadline = z.infer<typeof TelegramAssessmentDeadlineSchema>;

export const TelegramAssessmentDeadlineDashboardSchema = z.object({
  assessments: z.array(TelegramAssessmentDeadlineSchema),
});
export type TelegramAssessmentDeadlineDashboard = z.infer<typeof TelegramAssessmentDeadlineDashboardSchema>;

export const TelegramAttendanceHealthSignalSchema = z.object({
  kind: z.enum(["attendance", "punctuality"]),
  level: z.enum(["watch", "warning"]),
  count: z.number().int().nonnegative(),
  title: z.string(),
  message: z.string(),
  advice: z.array(z.string()),
});
export type TelegramAttendanceHealthSignal = z.infer<typeof TelegramAttendanceHealthSignalSchema>;

export const TelegramAttendanceAchievementSchema = z.object({
  kind: z.enum(["perfect_week", "consistency", "on_time", "comeback"]),
  title: z.string(),
  description: z.string(),
  icon: z.string(),
});
export type TelegramAttendanceAchievement = z.infer<typeof TelegramAttendanceAchievementSchema>;

export const TelegramAttendanceHealthSchema = z.object({
  state: z.enum(["healthy", "watch", "warning", "recovery"]),
  attendanceStreak: z.number().int().nonnegative(),
  onTimeStreak: z.number().int().nonnegative(),
  consecutiveLate: z.number().int().nonnegative(),
  absencePermissionCount: z.number().int().nonnegative(),
  signals: z.array(TelegramAttendanceHealthSignalSchema),
  achievements: z.array(TelegramAttendanceAchievementSchema).optional(),
  message: z.string(),
});
export type TelegramAttendanceHealth = z.infer<typeof TelegramAttendanceHealthSchema>;

export const TelegramAttendanceHealthCardSchema = z.object({
  offeringId: z.string(),
  courseCode: z.string(),
  courseTitle: z.string(),
  sectionCode: z.string(),
  attendanceRate: z.number().min(0).max(100).nullable(),
  counts: z.object({
    Absent: z.number().int().nonnegative(),
    Excused: z.number().int().nonnegative(),
    Late: z.number().int().nonnegative(),
    PermissionPending: z.number().int().nonnegative(),
  }),
  health: TelegramAttendanceHealthSchema,
  deepLink: z.string(),
});
export type TelegramAttendanceHealthCard = z.infer<typeof TelegramAttendanceHealthCardSchema>;

export const TelegramStudentAttendanceHistorySchema = z.object({
  offeringId: z.string(),
  studentId: z.string(),
  studentNumber: z.string(),
  totalSessions: z.number().int().nonnegative(),
  markedSessions: z.number().int().nonnegative(),
  attendanceRate: z.number().min(0).max(100).nullable(),
  counts: z.object({
    Present: z.number().int().nonnegative(),
    Absent: z.number().int().nonnegative(),
    Late: z.number().int().nonnegative(),
    Excused: z.number().int().nonnegative(),
    PermissionPending: z.number().int().nonnegative(),
  }),
  health: TelegramAttendanceHealthSchema,
  history: z.array(z.object({
    sessionId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["Present", "Absent", "Late", "Excused"]).nullable(),
    permissionPending: z.boolean(),
    permissionPendingSince: z.string().datetime().nullable(),
    note: z.string(),
    updatedAt: z.string().datetime(),
  })),
});
export type TelegramStudentAttendanceHistory = z.infer<typeof TelegramStudentAttendanceHistorySchema>;

export const TelegramLecturerWorkloadSchema = z.object({
  scheduledWeeklyHours: z.number().nonnegative(),
  peakWeeklyHours: z.number().nonnegative(),
  totalHours: z.number().nonnegative(),
  coLecturerAssumption: z.string(),
  scheduleRows: z.array(z.object({
    meetingId: z.string(),
    offeringId: z.string(),
    course: z.object({ id: z.string(), code: z.string(), title: z.string() }),
    term: z.string(),
    sectionCode: z.string(),
    role: z.enum(["Primary", "Co-Lecturer"]),
    dayOfWeek: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    room: z.string().nullable(),
    activityType: z.string(),
    durationHours: z.number(),
  })),
  weeklyTotals: z.array(z.object({
    term: z.string(),
    week: z.number().int(),
    totalContactHours: z.number(),
  })),
});
export type TelegramLecturerWorkload = z.infer<typeof TelegramLecturerWorkloadSchema>;
