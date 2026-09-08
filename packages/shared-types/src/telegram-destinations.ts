import { z } from "zod";

export const TelegramDestinationChatTypeSchema = z.enum(["GROUP", "SUPERGROUP", "CHANNEL"]);
export type TelegramDestinationChatType = z.infer<typeof TelegramDestinationChatTypeSchema>;

export const TelegramDestinationAudienceSchema = z.enum([
  "ALL_LECTURERS",
  "ALL_STUDENTS",
  "COHORT",
  "CLASS_SECTION",
  "CUSTOM",
]);
export type TelegramDestinationAudience = z.infer<typeof TelegramDestinationAudienceSchema>;

export const TelegramDestinationCreatableAudienceSchema = z.enum([
  "ALL_LECTURERS",
  "ALL_STUDENTS",
  "COHORT",
  "CUSTOM",
]);
export type TelegramDestinationCreatableAudience = z.infer<typeof TelegramDestinationCreatableAudienceSchema>;

export const TelegramDestinationStatusSchema = z.enum(["PENDING", "OBSERVED", "CONNECTED", "DISABLED"]);
export type TelegramDestinationStatus = z.infer<typeof TelegramDestinationStatusSchema>;

export const TelegramDestinationSchema = z.object({
  id: z.string().min(1),
  programmeId: z.string().min(1),
  name: z.string().min(1).max(120),
  chatTitle: z.string().optional(),
  chatType: TelegramDestinationChatTypeSchema,
  botKind: z.enum(["PMS", "PUBLIC_INFO"]),
  audienceType: TelegramDestinationAudienceSchema,
  scopeId: z.string().min(1).optional(),
  purpose: z.string().optional(),
  status: TelegramDestinationStatusSchema,
  enabled: z.boolean(),
  connected: z.boolean(),
  verifiedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type TelegramDestination = z.infer<typeof TelegramDestinationSchema>;

export const TelegramDestinationCreateRequestSchema = z.object({
  programmeId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  audienceType: TelegramDestinationCreatableAudienceSchema,
  scopeId: z.string().trim().min(1).optional(),
  purpose: z.string().trim().max(500).optional(),
  chatType: TelegramDestinationChatTypeSchema.default("SUPERGROUP"),
}).strict().superRefine((value, context) => {
  if (value.audienceType === "COHORT" && !value.scopeId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scopeId"], message: "Cohort destinations require a PMS cohort" });
  }
  if (value.audienceType !== "COHORT" && value.scopeId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scopeId"], message: "This audience does not accept a scope" });
  }
});
export type TelegramDestinationCreateRequest = z.infer<typeof TelegramDestinationCreateRequestSchema>;

export const TelegramDestinationUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  purpose: z.string().trim().max(500).optional(),
  enabled: z.boolean().optional(),
}).strict();
export type TelegramDestinationUpdateRequest = z.infer<typeof TelegramDestinationUpdateRequestSchema>;

export const TelegramDestinationListResponseSchema = z.object({
  programmeId: z.string().min(1),
  destinations: z.array(TelegramDestinationSchema),
}).strict();
export type TelegramDestinationListResponse = z.infer<typeof TelegramDestinationListResponseSchema>;

export const TelegramDestinationCohortOptionSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  intakeYear: z.number().int(),
  status: z.string().min(1),
}).strict();
export type TelegramDestinationCohortOption = z.infer<typeof TelegramDestinationCohortOptionSchema>;

export const TelegramDestinationCohortsResponseSchema = z.object({
  programmeId: z.string().min(1),
  cohorts: z.array(TelegramDestinationCohortOptionSchema),
}).strict();
export type TelegramDestinationCohortsResponse = z.infer<typeof TelegramDestinationCohortsResponseSchema>;

export const TelegramDestinationRegistrationStartSchema = z.object({
  registrationId: z.string().min(1),
  code: z.string().min(20),
  expiresInSeconds: z.number().int().positive(),
  command: z.string().min(1),
  destination: TelegramDestinationSchema,
}).strict();
export type TelegramDestinationRegistrationStart = z.infer<typeof TelegramDestinationRegistrationStartSchema>;

export const TelegramDestinationRegistrationPendingSchema = z.object({
  id: z.string().min(1),
  expiresAt: z.string().datetime(),
  observed: z.boolean(),
  observedChatTitle: z.string().optional(),
  observedChatType: TelegramDestinationChatTypeSchema.optional(),
  observedAt: z.string().datetime().optional(),
}).strict();
export type TelegramDestinationRegistrationPending = z.infer<typeof TelegramDestinationRegistrationPendingSchema>;

export const TelegramDestinationConfirmRequestSchema = z.object({ registrationId: z.string().min(1) }).strict();
export type TelegramDestinationConfirmRequest = z.infer<typeof TelegramDestinationConfirmRequestSchema>;

export const TelegramDestinationDeliverySchema = z.object({
  id: z.string().min(1),
  eventKey: z.string().min(1),
  kind: z.string().min(1),
  resourceId: z.string().min(1),
  status: z.enum(["pending", "sent", "failed"]),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().optional(),
  telegramMessageId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type TelegramDestinationDelivery = z.infer<typeof TelegramDestinationDeliverySchema>;
