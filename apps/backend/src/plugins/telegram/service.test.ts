import { afterEach, describe, expect, test } from "bun:test";
import { getPmsTelegramConfig } from "./config.ts";
import {
  TelegramDisabledError,
  createTelegramService,
  telegramService,
} from "./service.ts";

const TELEGRAM_ENV_KEYS = [
  "TELEGRAM_PMS_ENABLED",
  "TELEGRAM_PMS_BOT_TOKEN",
  "TELEGRAM_PMS_BOT_USERNAME",
  "TELEGRAM_PUBLIC_ENABLED",
  "TELEGRAM_PUBLIC_BOT_TOKEN",
  "TELEGRAM_PUBLIC_BOT_USERNAME",
  "TELEGRAM_PUBLIC_WEBHOOK_SECRET",
  "TELEGRAM_ENABLED",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_MINI_APP_URL",
  "TELEGRAM_MINI_APP_SHORT_NAME",
  "TELEGRAM_INIT_DATA_MAX_AGE_SECONDS",
  "TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS",
] as const;

const original = Object.fromEntries(
  TELEGRAM_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof TELEGRAM_ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of TELEGRAM_ENV_KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Telegram service", () => {
  test("publishes only PMS bot metadata and never serializes either server-only token", () => {
    process.env.TELEGRAM_PMS_ENABLED = "true";
    process.env.TELEGRAM_PMS_BOT_TOKEN = "pms-super-secret-token";
    process.env.TELEGRAM_PMS_BOT_USERNAME = "DSEPMSBot";
    process.env.TELEGRAM_MINI_APP_URL = "https://example.com/telegram";
    process.env.TELEGRAM_MINI_APP_SHORT_NAME = "pms";
    process.env.TELEGRAM_PUBLIC_ENABLED = "true";
    process.env.TELEGRAM_PUBLIC_BOT_TOKEN = "public-super-secret-token";
    process.env.TELEGRAM_PUBLIC_BOT_USERNAME = "DSEInformationBot";
    process.env.TELEGRAM_PUBLIC_WEBHOOK_SECRET = "public-webhook-secret";

    const config = telegramService.publicConfig();
    expect(config).toEqual({
      enabled: true,
      botUsername: "DSEPMSBot",
      miniAppUrl: "https://example.com/telegram",
      miniAppShortName: "pms",
    });
    expect(JSON.stringify(config)).not.toContain("pms-super-secret-token");
    expect(JSON.stringify(config)).not.toContain("public-super-secret-token");
    expect(JSON.stringify(config)).not.toContain("DSEInformationBot");
  });

  test("fails closed when Telegram PMS Bot is disabled", async () => {
    const service = createTelegramService({
      getConfig: () => ({
        enabled: false,
        publicProgrammeId: "dse",
        initDataMaxAgeSeconds: 300,
        initDataMaxFutureSkewSeconds: 30,
      }),
    });
    await expect(service.verifyInitData("signed-data")).rejects.toBeInstanceOf(
      TelegramDisabledError,
    );
  });

  test("verifies Mini App initData with the PMS token, never the public token", async () => {
    let verifierToken: string | undefined;
    const env = {
      TELEGRAM_PMS_ENABLED: "true",
      TELEGRAM_PMS_BOT_TOKEN: "pms-verification-token",
      TELEGRAM_PMS_BOT_USERNAME: "DSEPMSBot",
      TELEGRAM_MINI_APP_URL: "https://example.com/telegram",
      TELEGRAM_MINI_APP_SHORT_NAME: "pms",
      TELEGRAM_PUBLIC_ENABLED: "true",
      TELEGRAM_PUBLIC_BOT_TOKEN: "public-must-not-verify-init-data",
      TELEGRAM_PUBLIC_BOT_USERNAME: "DSEInformationBot",
      TELEGRAM_PUBLIC_WEBHOOK_SECRET: "public-webhook-secret",
    } as NodeJS.ProcessEnv;
    const service = createTelegramService({
      getConfig: () => getPmsTelegramConfig(env),
      verifier: (_initData, options) => {
        verifierToken = options.botToken;
        return {
          telegramUser: { id: "123", username: "seyha" },
          authDate: new Date("2026-08-16T05:00:00.000Z"),
          expiresAt: new Date("2026-08-16T05:05:00.000Z"),
          queryId: "query-1",
        };
      },
      replayStore: {
        record: async () => ({
          verificationId: "550e8400-e29b-41d4-a716-446655440000",
          initDataDigest: "a".repeat(64),
        }),
      },
    });

    await service.verifyInitData("signed-data");
    expect(verifierToken).toBe("pms-verification-token");
    expect(verifierToken).not.toBe("public-must-not-verify-init-data");
  });

  test("returns only a verified pre-link Telegram context", async () => {
    let replayInput: unknown;
    const service = createTelegramService({
      getConfig: () => ({
        enabled: true,
        botToken: "server-only-token",
        botUsername: "DSEPMSBot",
        miniAppUrl: "https://example.com/telegram",
        miniAppShortName: "pms",
        publicProgrammeId: "dse",
        initDataMaxAgeSeconds: 300,
        initDataMaxFutureSkewSeconds: 30,
      }),
      verifier: () => ({
        telegramUser: { id: "123", username: "seyha" },
        authDate: new Date("2026-08-16T05:00:00.000Z"),
        expiresAt: new Date("2026-08-16T05:05:00.000Z"),
        queryId: "query-1",
      }),
      replayStore: {
        record: async (input) => {
          replayInput = input;
          return {
            verificationId: "550e8400-e29b-41d4-a716-446655440000",
            initDataDigest: "a".repeat(64),
          };
        },
      },
    });

    const result = await service.verifyInitData("signed-data");
    expect(result).toEqual({
      verified: true,
      verificationId: "550e8400-e29b-41d4-a716-446655440000",
      telegramUser: { id: "123", username: "seyha" },
      authDate: "2026-08-16T05:00:00.000Z",
      expiresAt: "2026-08-16T05:05:00.000Z",
      linked: false,
    });
    expect(replayInput).toMatchObject({
      rawInitData: "signed-data",
      telegramUserId: "123",
      queryId: "query-1",
    });
    expect(JSON.stringify(result)).not.toContain("server-only-token");
    expect("userId" in result).toBe(false);
    expect("role" in result).toBe(false);
    expect("permissions" in result).toBe(false);
  });
});
