import { afterEach, describe, expect, test } from "bun:test";
import {
  TelegramDisabledError,
  createTelegramService,
  telegramService,
} from "./service.ts";

const original = {
  TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  TELEGRAM_MINI_APP_URL: process.env.TELEGRAM_MINI_APP_URL,
  TELEGRAM_MINI_APP_SHORT_NAME: process.env.TELEGRAM_MINI_APP_SHORT_NAME,
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS:
    process.env.TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS,
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Telegram service", () => {
  test("never serializes the server-only bot token", () => {
    process.env.TELEGRAM_ENABLED = "true";
    process.env.TELEGRAM_BOT_TOKEN = "super-secret-token";
    process.env.TELEGRAM_BOT_USERNAME = "DSEPMSBot";
    process.env.TELEGRAM_MINI_APP_URL = "https://example.com/telegram";
    process.env.TELEGRAM_MINI_APP_SHORT_NAME = "pms";

    const config = telegramService.publicConfig();
    expect(config).toEqual({
      enabled: true,
      botUsername: "DSEPMSBot",
      miniAppUrl: "https://example.com/telegram",
      miniAppShortName: "pms",
    });
    expect(JSON.stringify(config)).not.toContain("super-secret-token");
  });

  test("fails closed when Telegram is disabled", async () => {
    const service = createTelegramService({
      getConfig: () => ({
        enabled: false,
        initDataMaxAgeSeconds: 300,
        initDataMaxFutureSkewSeconds: 30,
      }),
    });
    await expect(service.verifyInitData("signed-data")).rejects.toBeInstanceOf(
      TelegramDisabledError,
    );
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
