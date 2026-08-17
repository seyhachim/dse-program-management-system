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
  }),
  history: z.array(z.object({
    sessionId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["Present", "Absent", "Late", "Excused"]).nullable(),
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
