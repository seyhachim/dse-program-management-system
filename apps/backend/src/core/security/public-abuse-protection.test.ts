import { describe, expect, test } from "bun:test";
import {
  FixedWindowRateLimiter,
  getPublicAbuseProtectionConfig,
  purposeHmac,
} from "./public-abuse-protection.ts";

describe("public abuse protection", () => {
  test("allows normal traffic, blocks at the configured threshold, and resets", () => {
    const limiter = new FixedWindowRateLimiter();
    expect(limiter.check("actor", 2, 1_000, 10_000).allowed).toBe(true);
    expect(limiter.check("actor", 2, 1_000, 10_100).allowed).toBe(true);
    const blocked = limiter.check("actor", 2, 1_000, 10_200);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(limiter.check("actor", 2, 1_000, 11_001).allowed).toBe(true);
  });

  test("isolates actors and HMAC purposes", () => {
    const limiter = new FixedWindowRateLimiter();
    expect(limiter.check("actor-a", 1, 1_000, 1).allowed).toBe(true);
    expect(limiter.check("actor-a", 1, 1_000, 2).allowed).toBe(false);
    expect(limiter.check("actor-b", 1, 1_000, 2).allowed).toBe(true);

    const rateKey = purposeHmac("secret", "telegram-rate-limit:actor:v1", 12345);
    const analyticsKey = purposeHmac("secret", "ask-dse-analytics-actor:v1", 12345);
    expect(rateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(analyticsKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rateKey).not.toBe(analyticsKey);
    expect(rateKey).not.toContain("12345");
  });

  test("loads independent configurable thresholds and rejects invalid values", () => {
    const config = getPublicAbuseProtectionConfig({
      PUBLIC_SEARCH_RATE_LIMIT_MAX: "9",
      PUBLIC_SEARCH_RATE_LIMIT_WINDOW_SECONDS: "20",
      TELEGRAM_GLOBAL_UPDATE_RATE_LIMIT_MAX: "40",
      TELEGRAM_ACTOR_UPDATE_RATE_LIMIT_MAX: "8",
      TELEGRAM_CALLBACK_RATE_LIMIT_MAX: "5",
      TELEGRAM_ASK_DSE_RATE_LIMIT_MAX: "4",
      TELEGRAM_RATE_LIMIT_WINDOW_SECONDS: "30",
      TELEGRAM_PUBLIC_MAX_UPDATE_BYTES: "4096",
    });
    expect(config).toEqual({
      publicSearchMax: 9,
      publicSearchWindowMs: 20_000,
      telegramGlobalUpdateMax: 40,
      telegramActorUpdateMax: 8,
      telegramCallbackMax: 5,
      telegramAskDseMax: 4,
      telegramWindowMs: 30_000,
      telegramMaxUpdateBytes: 4096,
    });
    expect(() => getPublicAbuseProtectionConfig({ PUBLIC_SEARCH_RATE_LIMIT_MAX: "0" }))
      .toThrow("PUBLIC_SEARCH_RATE_LIMIT_MAX must be a positive integer");
  });
});
