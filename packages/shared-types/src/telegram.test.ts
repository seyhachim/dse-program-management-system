import { describe, expect, test } from "bun:test";
import {
  TelegramHealthResponseSchema,
  TelegramInitDataVerifyRequestSchema,
  TelegramInitDataVerifyResponseSchema,
  TelegramPublicConfigSchema,
  telegramManifest,
} from "./telegram.ts";

describe("Telegram public contracts", () => {
  test("accepts public configuration", () => {
    expect(
      TelegramPublicConfigSchema.parse({
        enabled: true,
        botUsername: "DSEPMSBot",
        miniAppUrl: "https://example.com/telegram",
        miniAppShortName: "pms",
      }),
    ).toEqual({
      enabled: true,
      botUsername: "DSEPMSBot",
      miniAppUrl: "https://example.com/telegram",
      miniAppShortName: "pms",
    });
  });

  test("rejects malformed public configuration", () => {
    expect(() =>
      TelegramPublicConfigSchema.parse({ enabled: true, miniAppUrl: "not-a-url" }),
    ).toThrow();
  });

  test("keeps the API mount id stable", () => {
    expect(telegramManifest.id).toBe("telegram");
  });

  test("validates health responses", () => {
    expect(
      TelegramHealthResponseSchema.parse({ ok: true, enabled: false, configured: true }),
    ).toEqual({ ok: true, enabled: false, configured: true });
  });

  test("validates init data verification request and response contracts", () => {
    expect(
      TelegramInitDataVerifyRequestSchema.parse({ initData: "auth_date=1&hash=abc" }),
    ).toEqual({ initData: "auth_date=1&hash=abc" });

    expect(
      TelegramInitDataVerifyResponseSchema.parse({
        verified: true,
        verificationId: "550e8400-e29b-41d4-a716-446655440000",
        telegramUser: { id: "123456789" },
        authDate: "2026-08-16T05:00:00.000Z",
        expiresAt: "2026-08-16T05:05:00.000Z",
      }).telegramUser.id,
    ).toBe("123456789");
  });
});
