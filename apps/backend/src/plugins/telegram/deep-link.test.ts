import { afterEach, describe, expect, test } from "bun:test";
import { createTelegramDeepLink, resolveTelegramDeepLink } from "./deep-link.ts";

const original = {
  JWT_SECRET: process.env.JWT_SECRET,
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

function configureTelegram() {
  process.env.JWT_SECRET = "telegram-test-secret-with-enough-entropy";
  process.env.TELEGRAM_ENABLED = "true";
  process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  process.env.TELEGRAM_BOT_USERNAME = "DSEPMSBot";
  process.env.TELEGRAM_MINI_APP_URL = "https://pms.example.edu/telegram";
  process.env.TELEGRAM_MINI_APP_SHORT_NAME = "pms";
}

describe("Telegram Mini App deep links", () => {
  test("round-trips only a signed Mini App destination", () => {
    configureTelegram();
    const destination = "/telegram/classes/offering-1?announcement=announcement-1";
    const url = new URL(createTelegramDeepLink(destination));
    const token = url.searchParams.get("startapp");
    expect(token).toBeTruthy();
    expect(resolveTelegramDeepLink(token!)).toBe(destination);
  });

  test("refuses destinations outside the Telegram Mini App", () => {
    configureTelegram();
    expect(() => createTelegramDeepLink("/admin/users")).toThrow();
  });

  test("rejects a tampered token", () => {
    configureTelegram();
    const token = new URL(createTelegramDeepLink("/telegram/results")).searchParams.get("startapp")!;
    expect(() => resolveTelegramDeepLink(`${token.slice(0, -1)}x`)).toThrow();
  });
});
