import { z } from "zod";
import { Role } from "./auth.ts";

export const TelegramUsageEventTypeSchema = z.enum([
  "MiniAppOpened",
  "HomeViewed",
  "ScheduleViewed",
  "ClassViewed",
  "AnnouncementsViewed",
  "ResultsViewed",
  "SurveysViewed",
  "AssessmentDeadlinesViewed",
  "AttendanceHistoryViewed",
  "LecturerWorkloadViewed",
  "AttendanceRosterViewed",
]);
export type TelegramUsageEventType = z.infer<typeof TelegramUsageEventTypeSchema>;

export const TelegramAnalyticsRangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(180).default(30),
});
export type TelegramAnalyticsRange = z.infer<typeof TelegramAnalyticsRangeSchema>;

export const TelegramAnalyticsRoleBreakdownItemSchema = z.object({
  role: Role,
  eventCount: z.number().int().nonnegative(),
  uniqueUsers: z.number().int().nonnegative(),
});
export type TelegramAnalyticsRoleBreakdownItem = z.infer<
  typeof TelegramAnalyticsRoleBreakdownItemSchema
>;

export const TelegramAnalyticsEventBreakdownItemSchema = z.object({
  eventType: TelegramUsageEventTypeSchema,
  count: z.number().int().nonnegative(),
});
export type TelegramAnalyticsEventBreakdownItem = z.infer<
  typeof TelegramAnalyticsEventBreakdownItemSchema
>;

export const TelegramAnalyticsUnresolvedQuestionSchema = z.object({
  normalizedQuestion: z.string().min(1).max(500),
  sampleQuestion: z.string().min(1).max(500),
  count: z.number().int().positive(),
});
export type TelegramAnalyticsUnresolvedQuestion = z.infer<
  typeof TelegramAnalyticsUnresolvedQuestionSchema
>;

export const TelegramAnalyticsDashboardSchema = z.object({
  programmeId: z.string().min(1),
  periodDays: z.number().int().min(1).max(180),
  retentionDays: z.number().int().positive(),
  miniApp: z.object({
    totalEvents: z.number().int().nonnegative(),
    opens: z.number().int().nonnegative(),
    uniqueUsers: z.number().int().nonnegative(),
    roleBreakdown: z.array(TelegramAnalyticsRoleBreakdownItemSchema),
    topEvents: z.array(TelegramAnalyticsEventBreakdownItemSchema),
  }),
  askDse: z.object({
    informationGapQuestions: z.number().int().nonnegative(),
    lowConfidence: z.number().int().nonnegative(),
    noMatch: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    topUnresolved: z.array(TelegramAnalyticsUnresolvedQuestionSchema),
  }),
});
export type TelegramAnalyticsDashboard = z.infer<typeof TelegramAnalyticsDashboardSchema>;
