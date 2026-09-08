import { describe, expect, test } from "bun:test";
import { TelegramDestinationError } from "./destination-service.ts";
import { shouldAcknowledgeTelegramRegistrationError } from "./destination-router.ts";

describe("Telegram destination registration webhook acknowledgement", () => {
  test("acknowledges expected registration-domain rejections", () => {
    expect(shouldAcknowledgeTelegramRegistrationError(
      new TelegramDestinationError("INVALID_REGISTRATION", "expired"),
    )).toBe(true);
    expect(shouldAcknowledgeTelegramRegistrationError(
      new TelegramDestinationError("CONFLICT", "wrong chat type"),
    )).toBe(true);
  });

  test("does not swallow unexpected infrastructure failures", () => {
    expect(shouldAcknowledgeTelegramRegistrationError(new Error("database unavailable"))).toBe(false);
  });
});
