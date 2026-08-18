import type {
  TelegramHealthResponse,
  TelegramInitDataVerifyResponse,
  TelegramPublicConfig,
} from "@dse-pms/shared-types";
import { getTelegramConfig } from "./config.ts";
import { verifyTelegramInitData } from "./init-data.ts";
import {
  telegramReplayStore,
  type TelegramReplayStore,
} from "./replay-store.ts";

export class TelegramDisabledError extends Error {
  readonly code = "TELEGRAM_DISABLED" as const;

  constructor() {
    super("Telegram Mini App integration is disabled");
    this.name = "TelegramDisabledError";
  }
}

export interface TelegramService {
  publicConfig(): TelegramPublicConfig;
  health(): TelegramHealthResponse;
  verifyInitData(initData: string): Promise<TelegramInitDataVerifyResponse>;
}

interface TelegramServiceDependencies {
  getConfig?: typeof getTelegramConfig;
  verifier?: typeof verifyTelegramInitData;
  replayStore?: TelegramReplayStore;
}

export function createTelegramService(
  dependencies: TelegramServiceDependencies = {},
): TelegramService {
  const readConfig = dependencies.getConfig ?? getTelegramConfig;
  const verifier = dependencies.verifier ?? verifyTelegramInitData;
  const replayStore = dependencies.replayStore ?? telegramReplayStore;

  return {
    publicConfig() {
      const config = readConfig();
      return {
        enabled: config.enabled,
        botUsername: config.botUsername,
        miniAppUrl: config.miniAppUrl,
        miniAppShortName: config.miniAppShortName,
      };
    },

    health() {
      const config = readConfig();
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

    async verifyInitData(initData) {
      const config = readConfig();
      if (!config.enabled || !config.botToken) throw new TelegramDisabledError();

      const verified = verifier(initData, {
        botToken: config.botToken,
        maxAgeSeconds: config.initDataMaxAgeSeconds,
        maxFutureSkewSeconds: config.initDataMaxFutureSkewSeconds,
      });
      const { verificationId } = await replayStore.record({
        rawInitData: initData,
        telegramUserId: verified.telegramUser.id,
        queryId: verified.queryId,
        authDate: verified.authDate,
        expiresAt: verified.expiresAt,
      });

      return {
        verified: true,
        verificationId,
        telegramUser: verified.telegramUser,
        authDate: verified.authDate.toISOString(),
        expiresAt: verified.expiresAt.toISOString(),
        linked: false,
      };
    },
  };
}

export const telegramService = createTelegramService();
