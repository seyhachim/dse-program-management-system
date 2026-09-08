import { describe, expect, test } from "bun:test";
import { canHardDeleteTelegramDestination } from "./destination-delete-service.ts";

describe("Telegram destination hard-delete eligibility", () => {
  test("allows only never-connected pending destinations without deliveries", () => {
    expect(canHardDeleteTelegramDestination({
      status: "PENDING",
      chatId: null,
      verifiedAt: null,
      deliveryCount: 0,
    })).toBe(true);
  });

  test("preserves connected or historically verified destinations", () => {
    expect(canHardDeleteTelegramDestination({
      status: "CONNECTED",
      chatId: "-100123",
      verifiedAt: new Date(),
      deliveryCount: 0,
    })).toBe(false);
    expect(canHardDeleteTelegramDestination({
      status: "PENDING",
      chatId: null,
      verifiedAt: new Date(),
      deliveryCount: 0,
    })).toBe(false);
  });

  test("preserves destinations with delivery history", () => {
    expect(canHardDeleteTelegramDestination({
      status: "PENDING",
      chatId: null,
      verifiedAt: null,
      deliveryCount: 1,
    })).toBe(false);
  });
});
