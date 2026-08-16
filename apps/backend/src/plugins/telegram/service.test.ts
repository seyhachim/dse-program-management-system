import { afterEach, describe, expect, test } from "bun:test";
import { telegramService } from "./service.ts";

const original = {
  TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  TELEGRAM_MINI_APP_URL: process.env.TELEGRAM_MINI_APP_URL,
  TELEGRAM_MINI_APP_SHORT_NAME: process.env.TELEGRAM_MINI_APP_SHORT_NAME,
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
});
