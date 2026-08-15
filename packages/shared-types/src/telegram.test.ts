import { describe, expect, test } from "bun:test";
import {
  TelegramHealthResponseSchema,
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
});
