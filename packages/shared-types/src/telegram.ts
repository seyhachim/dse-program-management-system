import { z } from "zod";
import type { PluginManifest } from "./plugins.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export const TelegramPublicConfigSchema = z.object({
  enabled: z.boolean(),
  botUsername: z.string().min(1).optional(),
  miniAppUrl: z.string().url().optional(),
  miniAppShortName: z.string().min(1).optional(),
});
export type TelegramPublicConfig = z.infer<typeof TelegramPublicConfigSchema>;

export const TelegramHealthResponseSchema = z.object({
  ok: z.boolean(),
  enabled: z.boolean(),
  configured: z.boolean(),
});
export type TelegramHealthResponse = z.infer<typeof TelegramHealthResponseSchema>;

export const TelegramInitDataVerifyRequestSchema = z.object({
  initData: z.string().min(1).max(16_384),
});
export type TelegramInitDataVerifyRequest = z.infer<typeof TelegramInitDataVerifyRequestSchema>;

export const TelegramVerifiedUserSchema = z.object({
  id: z.string().regex(/^\d+$/),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  languageCode: z.string().optional(),
});
export type TelegramVerifiedUser = z.infer<typeof TelegramVerifiedUserSchema>;

export const TelegramLinkedAccountSchema = z.object({
  linked: z.boolean(),
  telegramUserId: z.string().regex(/^\d+$/).optional(),
  telegramUsername: z.string().optional(),
  linkedAt: z.string().regex(ISO_DATE_TIME_PATTERN).optional(),
  lastVerifiedAt: z.string().regex(ISO_DATE_TIME_PATTERN).optional(),
});
export type TelegramLinkedAccount = z.infer<typeof TelegramLinkedAccountSchema>;

export const TelegramMiniRoleSchema = z.enum([
  "admin",
  "program_coordinator",
  "program_secretary",
  "lecturer",
  "qa_contributor",
  "qa_reviewer",
  "student",
]);
export type TelegramMiniRole = z.infer<typeof TelegramMiniRoleSchema>;

export const TelegramInitDataVerifyResponseSchema = z.object({
  verified: z.literal(true),
  verificationId: z.string().regex(UUID_PATTERN),
  telegramUser: TelegramVerifiedUserSchema,
  authDate: z.string().regex(ISO_DATE_TIME_PATTERN),
  expiresAt: z.string().regex(ISO_DATE_TIME_PATTERN),
  linked: z.boolean().optional(),
  sessionToken: z.string().min(1).optional(),
  sessionExpiresAt: z.string().regex(ISO_DATE_TIME_PATTERN).optional(),
  roles: z.array(TelegramMiniRoleSchema).optional(),
});
export type TelegramInitDataVerifyResponse = z.infer<typeof TelegramInitDataVerifyResponseSchema>;

export const TelegramLinkRequestSchema = z.object({
  verificationId: z.string().regex(UUID_PATTERN),
});
export type TelegramLinkRequest = z.infer<typeof TelegramLinkRequestSchema>;

export const TelegramCourseCardSchema = z.object({
  offeringId: z.string(),
  courseCode: z.string(),
  courseTitle: z.string(),
  sectionCode: z.string(),
  term: z.string(),
  role: z.enum(["student", "lecturer"]),
  nextMeeting: z.object({
    dayOfWeek: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    room: z.string().nullable(),
    activityType: z.string(),
  }).nullable(),
});
export type TelegramCourseCard = z.infer<typeof TelegramCourseCardSchema>;

export const TelegramHomeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    roles: z.array(TelegramMiniRoleSchema),
  }),
  courses: z.array(TelegramCourseCardSchema),
  unreadAnnouncements: z.number().int().nonnegative(),
  publishedResultCount: z.number().int().nonnegative(),
  surveyActions: z.number().int().nonnegative(),
});
export type TelegramHomeResponse = z.infer<typeof TelegramHomeResponseSchema>;

export const TelegramScheduleResponseSchema = z.object({ courses: z.array(TelegramCourseCardSchema) });
export type TelegramScheduleResponse = z.infer<typeof TelegramScheduleResponseSchema>;

export const TelegramAnnouncementSchema = z.object({
  id: z.string(),
  offeringId: z.string(),
  courseCode: z.string(),
  courseTitle: z.string(),
  title: z.string(),
  body: z.string(),
  pinned: z.boolean(),
  publishedAt: z.string().regex(ISO_DATE_TIME_PATTERN),
});
export type TelegramAnnouncement = z.infer<typeof TelegramAnnouncementSchema>;

export const TelegramResultSchema = z.object({
  offeringId: z.string(),
  courseCode: z.string(),
  courseTitle: z.string(),
  assessmentItemId: z.string(),
  score: z.number(),
  maxScore: z.number(),
  feedback: z.string(),
  publishedAt: z.string().regex(ISO_DATE_TIME_PATTERN),
});
export type TelegramResult = z.infer<typeof TelegramResultSchema>;

export const TelegramSurveyStatusSchema = z.object({
  offeringId: z.string(),
  courseCode: z.string(),
  courseTitle: z.string(),
  submitted: z.boolean(),
  deepLink: z.string(),
});
export type TelegramSurveyStatus = z.infer<typeof TelegramSurveyStatusSchema>;

export const TelegramSurveySubmitSchema = z.object({
  offeringId: z.string().min(1),
  overallRating: z.number().int().min(1).max(5),
  teachingClarityRating: z.number().int().min(1).max(5),
  assessmentClarityRating: z.number().int().min(1).max(5),
  workload: z.enum(["light", "appropriate", "heavy"]),
  positiveComment: z.string().max(2000).default(""),
  improvementComment: z.string().max(2000).default(""),
});
export type TelegramSurveySubmit = z.infer<typeof TelegramSurveySubmitSchema>;

export const TelegramInitVerificationErrorCodeSchema = z.enum([
  "TELEGRAM_DISABLED",
  "INVALID_INIT_DATA",
  "INIT_DATA_EXPIRED",
  "INIT_DATA_REPLAYED",
  "TELEGRAM_NOT_LINKED",
  "TELEGRAM_LINK_CONFLICT",
  "TELEGRAM_SESSION_INVALID",
]);
export type TelegramInitVerificationErrorCode = z.infer<typeof TelegramInitVerificationErrorCodeSchema>;

export const TelegramInitVerificationErrorSchema = z.object({
  error: z.object({
    code: TelegramInitVerificationErrorCodeSchema,
    message: z.string().min(1),
  }),
});
export type TelegramInitVerificationError = z.infer<typeof TelegramInitVerificationErrorSchema>;

export const telegramManifest: PluginManifest = {
  id: "telegram",
  name: "Telegram Mini App",
  version: "1.0.0",
  description: "Secure role-aware Telegram Mini App companion for high-frequency PMS workflows.",
};
