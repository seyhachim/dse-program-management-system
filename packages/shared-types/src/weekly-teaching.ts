import { z } from "zod";

export const WeeklyTeachingWeekQuerySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(date.getTime())
      && date.toISOString().slice(0, 10) === value
      && date.getUTCDay() === 1;
  }, "Choose a valid Monday (YYYY-MM-DD)"),
}).strict();

export const WeeklyTeachingStatusSchema = z.enum([
  "held_as_planned",
  "held_with_changes",
  "not_held",
  "cancelled",
  "rescheduled",
  "approved_leave",
  "holiday",
  "missing_evidence",
  "upcoming",
]);
export type WeeklyTeachingStatus = z.infer<typeof WeeklyTeachingStatusSchema>;

export const WeeklyTeachingSessionSchema = z.object({
  meetingId: z.string(),
  offeringId: z.string().uuid(),
  occurrenceId: z.string().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dayOfWeek: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  room: z.string().nullable(),
  courseCode: z.string(),
  courseTitle: z.string(),
  sectionCode: z.string(),
  programmeYear: z.number().int().nullable(),
  term: z.string(),
  lecturerIds: z.array(z.string()),
  lecturerNames: z.array(z.string()),
  plannedWeek: z.number().int().positive().nullable(),
  plannedTopic: z.string().nullable(),
  actualTopic: z.string().nullable(),
  coverage: z.enum([
    "TAUGHT_AS_PLANNED", "PARTIALLY_COVERED", "DIFFERENT_TOPIC", "NOT_COVERED",
  ]).nullable(),
  status: WeeklyTeachingStatusSchema,
  scheduledMinutes: z.number().int().nonnegative(),
  deliveredMinutes: z.number().int().nonnegative(),
  arrivalRecorded: z.boolean(),
  approvedLeave: z.boolean(),
  classSessionStatus: z.string().nullable(),
  holidayName: z.string().nullable(),
  evidenceRecordedAt: z.string().datetime().nullable(),
}).strict();
export type WeeklyTeachingSession = z.infer<typeof WeeklyTeachingSessionSchema>;

export const WeeklyTeachingSummarySchema = z.object({
  scheduledSessions: z.number().int().nonnegative(),
  deliveredSessions: z.number().int().nonnegative(),
  scheduledMinutes: z.number().int().nonnegative(),
  deliveredMinutes: z.number().int().nonnegative(),
  heldAsPlanned: z.number().int().nonnegative(),
  heldWithChanges: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  notHeld: z.number().int().nonnegative(),
  approvedLeave: z.number().int().nonnegative(),
  rescheduled: z.number().int().nonnegative(),
  holidays: z.number().int().nonnegative(),
  missingEvidence: z.number().int().nonnegative(),
  upcoming: z.number().int().nonnegative(),
  reviewMinutes: z.number().int().nonnegative(),
}).strict();
export type WeeklyTeachingSummary = z.infer<typeof WeeklyTeachingSummarySchema>;

export const WeeklyTeachingReportSchema = z.object({
  programmeId: z.string(),
  weekStart: z.string(),
  weekEnd: z.string(),
  generatedAt: z.string().datetime(),
  unboundedActiveOfferings: z.number().int().nonnegative(),
  summary: WeeklyTeachingSummarySchema,
  sessions: z.array(WeeklyTeachingSessionSchema),
}).strict();
export type WeeklyTeachingReport = z.infer<typeof WeeklyTeachingReportSchema>;
