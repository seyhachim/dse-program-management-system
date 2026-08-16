import { z } from "zod";
import type { PluginManifest } from "./plugins.ts";

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
export type TelegramInitDataVerifyRequest = z.infer<
  typeof TelegramInitDataVerifyRequestSchema
>;

export const TelegramVerifiedUserSchema = z.object({
  id: z.string().regex(/^\d+$/),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  languageCode: z.string().optional(),
});
export type TelegramVerifiedUser = z.infer<typeof TelegramVerifiedUserSchema>;

export const TelegramInitDataVerifyResponseSchema = z.object({
  verified: z.literal(true),
  verificationId: z.string().uuid(),
  telegramUser: TelegramVerifiedUserSchema,
  authDate: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type TelegramInitDataVerifyResponse = z.infer<
  typeof TelegramInitDataVerifyResponseSchema
>;

export const TelegramInitVerificationErrorCodeSchema = z.enum([
  "TELEGRAM_DISABLED",
  "INVALID_INIT_DATA",
  "INIT_DATA_EXPIRED",
  "INIT_DATA_REPLAYED",
]);
export type TelegramInitVerificationErrorCode = z.infer<
  typeof TelegramInitVerificationErrorCodeSchema
>;

export const TelegramInitVerificationErrorSchema = z.object({
  error: z.object({
    code: TelegramInitVerificationErrorCodeSchema,
    message: z.string().min(1),
  }),
});
export type TelegramInitVerificationError = z.infer<
  typeof TelegramInitVerificationErrorSchema
>;

export const telegramManifest: PluginManifest = {
  id: "telegram",
  name: "Telegram Mini App",
  version: "0.2.0",
  description: "Telegram Mini App integration boundary and verified launch context.",
};
