import { describe, expect, test } from "bun:test";
import {
  TELEGRAM_START_PAYLOAD_MAX_LENGTH,
  buildTelegramStartPayload,
  parseTelegramStartPayload,
} from "./deep-link.ts";

describe("Telegram deep links", () => {
  test("builds and parses the v1 home payload", () => {
    const payload = buildTelegramStartPayload({ type: "home" });
    expect(payload).toBe("v1_home");
    expect(parseTelegramStartPayload(payload)).toEqual({ type: "home" });
  });

  test("rejects unsupported payloads", () => {
    expect(parseTelegramStartPayload("v2_home")).toBeNull();
    expect(parseTelegramStartPayload("v1_result_secret")).toBeNull();
  });

  test("rejects oversized payloads", () => {
    expect(
      parseTelegramStartPayload("x".repeat(TELEGRAM_START_PAYLOAD_MAX_LENGTH + 1)),
    ).toBeNull();
  });
});
