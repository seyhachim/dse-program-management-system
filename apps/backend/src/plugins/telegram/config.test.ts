import { describe, expect, test } from "bun:test";
import { getTelegramConfig } from "./config.ts";

describe("Telegram configuration", () => {
  test("is disabled by default without requiring secrets", () => {
    expect(getTelegramConfig({} as NodeJS.ProcessEnv)).toEqual({
      enabled: false,
      botToken: undefined,
      botUsername: undefined,
      miniAppUrl: undefined,
      miniAppShortName: undefined,
    });
  });

  test("accepts a complete enabled configuration", () => {
    expect(
      getTelegramConfig({
        TELEGRAM_ENABLED: "true",
        TELEGRAM_BOT_TOKEN: "secret-token",
        TELEGRAM_BOT_USERNAME: "DSEPMSBot",
        TELEGRAM_MINI_APP_URL: "https://example.com/telegram",
        TELEGRAM_MINI_APP_SHORT_NAME: "pms",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      enabled: true,
      botToken: "secret-token",
      botUsername: "DSEPMSBot",
      miniAppUrl: "https://example.com/telegram",
      miniAppShortName: "pms",
    });
  });

  test("fails closed when enabled without the bot token", () => {
    expect(() =>
      getTelegramConfig({
        TELEGRAM_ENABLED: "true",
        TELEGRAM_BOT_USERNAME: "DSEPMSBot",
        TELEGRAM_MINI_APP_URL: "https://example.com/telegram",
        TELEGRAM_MINI_APP_SHORT_NAME: "pms",
      } as NodeJS.ProcessEnv),
    ).toThrow("TELEGRAM_BOT_TOKEN");
  });

  test("rejects invalid enabled flag values", () => {
    expect(() =>
      getTelegramConfig({ TELEGRAM_ENABLED: "yes" } as NodeJS.ProcessEnv),
    ).toThrow("TELEGRAM_ENABLED");
  });

  test("rejects an invalid Mini App URL when enabled", () => {
    expect(() =>
      getTelegramConfig({
        TELEGRAM_ENABLED: "true",
        TELEGRAM_BOT_TOKEN: "secret-token",
        TELEGRAM_BOT_USERNAME: "DSEPMSBot",
        TELEGRAM_MINI_APP_URL: "not-a-url",
        TELEGRAM_MINI_APP_SHORT_NAME: "pms",
      } as NodeJS.ProcessEnv),
    ).toThrow("TELEGRAM_MINI_APP_URL");
  });
});
