import { describe, expect, test } from "bun:test";
import {
  TelegramHealthResponseSchema,
  TelegramInitDataVerifyRequestSchema,
  TelegramInitDataVerifyResponseSchema,
  TelegramInitVerificationErrorSchema,
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

  test("validates init data verification requests", () => {
    expect(TelegramInitDataVerifyRequestSchema.parse({ initData: "auth_date=1&hash=abc" })).toEqual({
      initData: "auth_date=1&hash=abc",
    });
    expect(() => TelegramInitDataVerifyRequestSchema.parse({ initData: "" })).toThrow();
    expect(() =>
      TelegramInitDataVerifyRequestSchema.parse({ initData: "x".repeat(16_385) }),
    ).toThrow();
  });

  test("validates the pre-link verified Telegram identity contract", () => {
    const result = TelegramInitDataVerifyResponseSchema.parse({
      verified: true,
      verificationId: "550e8400-e29b-41d4-a716-446655440000",
      telegramUser: {
        id: "123456789",
        username: "seyha",
        firstName: "Seyha",
      },
      authDate: "2026-08-16T05:00:00.000Z",
      expiresAt: "2026-08-16T05:05:00.000Z",
    });
    expect(result.telegramUser.id).toBe("123456789");
    expect("userId" in result).toBe(false);
    expect("role" in result).toBe(false);
    expect("token" in result).toBe(false);
  });

  test("rejects numeric Telegram ids in the API contract", () => {
    expect(() =>
      TelegramInitDataVerifyResponseSchema.parse({
        verified: true,
        verificationId: "550e8400-e29b-41d4-a716-446655440000",
        telegramUser: { id: 123456789 },
        authDate: "2026-08-16T05:00:00.000Z",
        expiresAt: "2026-08-16T05:05:00.000Z",
      }),
    ).toThrow();
  });

  test("validates stable verification error codes", () => {
    for (const code of [
      "TELEGRAM_DISABLED",
      "INVALID_INIT_DATA",
      "INIT_DATA_EXPIRED",
      "INIT_DATA_REPLAYED",
    ]) {
      expect(
        TelegramInitVerificationErrorSchema.parse({
          error: { code, message: "Verification failed" },
        }).error.code,
      ).toBe(code);
    }
  });
});
