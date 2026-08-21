import { createHmac } from "node:crypto";

export interface PublicAbuseProtectionConfig {
  publicSearchMax: number;
  publicSearchWindowMs: number;
  telegramGlobalUpdateMax: number;
  telegramActorUpdateMax: number;
  telegramCallbackMax: number;
  telegramAskDseMax: number;
  telegramWindowMs: number;
  telegramMaxUpdateBytes: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number, nowMs?: number): RateLimitDecision;
}

type Bucket = { count: number; resetAt: number };

const MAX_BUCKETS = 10_000;
const SWEEP_INTERVAL = 128;

export class FixedWindowRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private checks = 0;

  check(key: string, limit: number, windowMs: number, nowMs = Date.now()): RateLimitDecision {
    this.checks += 1;
    if (this.checks % SWEEP_INTERVAL === 0 || this.buckets.size >= MAX_BUCKETS) {
      this.sweep(nowMs);
    }

    const current = this.buckets.get(key);
    if (!current || current.resetAt <= nowMs) {
      if (!current && this.buckets.size >= MAX_BUCKETS) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)), remaining: 0 };
      }
      this.buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
      return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, limit - 1) };
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - nowMs) / 1000));
    if (current.count >= limit) {
      return { allowed: false, retryAfterSeconds, remaining: 0 };
    }

    current.count += 1;
    return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, limit - current.count) };
  }

  private sweep(nowMs: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= nowMs) this.buckets.delete(key);
    }
  }
}

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function getPublicAbuseProtectionConfig(
  env: NodeJS.ProcessEnv = process.env,
): PublicAbuseProtectionConfig {
  return {
    publicSearchMax: positiveInt(env, "PUBLIC_SEARCH_RATE_LIMIT_MAX", 300),
    publicSearchWindowMs: positiveInt(env, "PUBLIC_SEARCH_RATE_LIMIT_WINDOW_SECONDS", 60) * 1000,
    telegramGlobalUpdateMax: positiveInt(env, "TELEGRAM_GLOBAL_UPDATE_RATE_LIMIT_MAX", 600),
    telegramActorUpdateMax: positiveInt(env, "TELEGRAM_ACTOR_UPDATE_RATE_LIMIT_MAX", 60),
    telegramCallbackMax: positiveInt(env, "TELEGRAM_CALLBACK_RATE_LIMIT_MAX", 30),
    telegramAskDseMax: positiveInt(env, "TELEGRAM_ASK_DSE_RATE_LIMIT_MAX", 20),
    telegramWindowMs: positiveInt(env, "TELEGRAM_RATE_LIMIT_WINDOW_SECONDS", 60) * 1000,
    telegramMaxUpdateBytes: positiveInt(env, "TELEGRAM_PUBLIC_MAX_UPDATE_BYTES", 32_768),
  };
}

export function purposeHmac(secret: string, purpose: string, value: string | number): string {
  return createHmac("sha256", secret)
    .update(`${purpose}\0${String(value)}`)
    .digest("base64url");
}

export const publicAbuseRateLimiter = new FixedWindowRateLimiter();
