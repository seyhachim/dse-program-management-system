import type {
  TelegramHealthResponse,
  TelegramPublicConfig,
} from "@dse-pms/shared-types";
import { getTelegramConfig } from "./config.ts";

export interface TelegramService {
  publicConfig(): TelegramPublicConfig;
  health(): TelegramHealthResponse;
}

export const telegramService: TelegramService = {
  publicConfig() {
    const config = getTelegramConfig();
    return {
      enabled: config.enabled,
      botUsername: config.botUsername,
      miniAppUrl: config.miniAppUrl,
      miniAppShortName: config.miniAppShortName,
    };
  },

  health() {
    const config = getTelegramConfig();
    return {
      ok: true,
      enabled: config.enabled,
      configured:
        !config.enabled ||
        Boolean(
          config.botToken &&
            config.botUsername &&
            config.miniAppUrl &&
            config.miniAppShortName,
        ),
    };
  },
};
