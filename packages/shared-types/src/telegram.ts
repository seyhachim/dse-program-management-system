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

export const telegramManifest: PluginManifest = {
  id: "telegram",
  name: "Telegram Mini App",
  version: "0.1.0",
  description: "Telegram Mini App integration boundary and public configuration.",
};
