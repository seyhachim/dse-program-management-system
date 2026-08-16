import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  TELEGRAM_INIT_DATA_MAX_LENGTH,
  TelegramInitDataError,
  verifyTelegramInitData,
} from "./init-data.ts";

const BOT_TOKEN = "123456:test-bot-token";
const NOW = new Date("2026-08-16T05:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

function sign(fields: Record<string, string>): string {
  const entries = Object.entries(fields).sort(([left], [right]) => left.localeCompare(right));
  const check = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  const params = new URLSearchParams(fields);
  params.set("hash", hash);
  return params.toString();
}

function validInitData(authDate = NOW_SECONDS): string {
  return sign({
    auth_date: String(authDate),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({
      id: 900719925474000,
      first_name: "Seyha",
      last_name: "Chim",
      username: "seyha",
      language_code: "en",
    }),
  });
}

function verify(raw: string) {
  return verifyTelegramInitData(raw, {
    botToken: BOT_TOKEN,
    maxAgeSeconds: 300,
    maxFutureSkewSeconds: 30,
    now: NOW,
  });
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error("Expected verification to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(TelegramInitDataError);
    expect((error as TelegramInitDataError).code).toBe(code);
  }
}

describe("Telegram Mini App init data verification", () => {
  test("accepts a correctly signed fresh payload and normalizes the Telegram id", () => {
    expect(verify(validInitData())).toEqual({
      telegramUser: {
        id: "900719925474000",
        firstName: "Seyha",
        lastName: "Chim",
        username: "seyha",
        languageCode: "en",
      },
      authDate: NOW,
      expiresAt: new Date((NOW_SECONDS + 300) * 1000),
      queryId: "AAHdF6IQAAAAAN0XohDhrOrc",
    });
  });

  test("verification is independent of query parameter order", () => {
    const raw = validInitData();
    const params = new URLSearchParams(raw);
    const reordered = new URLSearchParams();
    for (const key of ["user", "hash", "query_id", "auth_date"]) {
      reordered.set(key, params.get(key)!);
    }
    expect(verify(reordered.toString()).telegramUser.id).toBe("900719925474000");
  });

  for (const field of ["user", "auth_date", "query_id"] as const) {
    test(`rejects tampering with ${field} after signing`, () => {
      const params = new URLSearchParams(validInitData());
      params.set(field, `${params.get(field)}tampered`);
      expectCode(() => verify(params.toString()), "INVALID_INIT_DATA");
    });
  }

  test("rejects a changed username inside the signed user object", () => {
    const params = new URLSearchParams(validInitData());
    const user = JSON.parse(params.get("user")!);
    user.username = "attacker";
    params.set("user", JSON.stringify(user));
    expectCode(() => verify(params.toString()), "INVALID_INIT_DATA");
  });

  test("rejects incorrect, malformed, short, long, missing, and duplicate hashes", () => {
    const variants: string[] = [];
    const invalid = new URLSearchParams(validInitData());
    invalid.set("hash", "0".repeat(64));
    variants.push(invalid.toString());

    const malformed = new URLSearchParams(validInitData());
    malformed.set("hash", "z".repeat(64));
    variants.push(malformed.toString());

    const short = new URLSearchParams(validInitData());
    short.set("hash", "a".repeat(62));
    variants.push(short.toString());

    const long = new URLSearchParams(validInitData());
    long.set("hash", "a".repeat(66));
    variants.push(long.toString());

    const missing = new URLSearchParams(validInitData());
    missing.delete("hash");
    variants.push(missing.toString());

    variants.push(`${validInitData()}&hash=${"a".repeat(64)}`);

    for (const raw of variants) {
      expectCode(() => verify(raw), "INVALID_INIT_DATA");
    }
  });

  test("rejects missing or malformed signed identity fields", () => {
    const missingUser = sign({ auth_date: String(NOW_SECONDS) });
    expectCode(() => verify(missingUser), "INVALID_INIT_DATA");

    const malformedUser = sign({ auth_date: String(NOW_SECONDS), user: "{" });
    expectCode(() => verify(malformedUser), "INVALID_INIT_DATA");

    const missingAuthDate = sign({ user: JSON.stringify({ id: 123 }) });
    expectCode(() => verify(missingAuthDate), "INVALID_INIT_DATA");

    const nonNumericAuthDate = sign({ auth_date: "today", user: JSON.stringify({ id: 123 }) });
    expectCode(() => verify(nonNumericAuthDate), "INVALID_INIT_DATA");
  });

  test("rejects empty, oversized, and duplicate-key input safely", () => {
    expectCode(() => verify(""), "INVALID_INIT_DATA");
    expectCode(() => verify("x".repeat(TELEGRAM_INIT_DATA_MAX_LENGTH + 1)), "INVALID_INIT_DATA");
    expectCode(() => verify(`${validInitData()}&query_id=duplicate`), "INVALID_INIT_DATA");
  });

  test("accepts data inside and at the freshness boundary", () => {
    expect(verify(validInitData(NOW_SECONDS - 299)).telegramUser.id).toBeTruthy();
    expect(verify(validInitData(NOW_SECONDS - 300)).telegramUser.id).toBeTruthy();
  });

  test("rejects data one second beyond the freshness boundary", () => {
    expectCode(() => verify(validInitData(NOW_SECONDS - 301)), "INIT_DATA_EXPIRED");
  });

  test("rejects old signed payloads", () => {
    expectCode(() => verify(validInitData(NOW_SECONDS - 3600)), "INIT_DATA_EXPIRED");
    expectCode(() => verify(validInitData(NOW_SECONDS - 86_400)), "INIT_DATA_EXPIRED");
  });

  test("accepts future timestamps within and at allowed clock skew", () => {
    expect(verify(validInitData(NOW_SECONDS + 29)).telegramUser.id).toBeTruthy();
    expect(verify(validInitData(NOW_SECONDS + 30)).telegramUser.id).toBeTruthy();
  });

  test("rejects future timestamps outside allowed clock skew", () => {
    expectCode(() => verify(validInitData(NOW_SECONDS + 31)), "INIT_DATA_EXPIRED");
  });

  test("invalid signatures fail even when auth_date is fresh", () => {
    const params = new URLSearchParams(validInitData());
    params.set("hash", "0".repeat(64));
    expectCode(() => verify(params.toString()), "INVALID_INIT_DATA");
  });
});
