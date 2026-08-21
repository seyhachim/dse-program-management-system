import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearTelegramSession,
  getCachedTelegramSession,
  saveTelegramSession,
} from "./telegram-client";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: new MemoryStorage(),
});

describe("Telegram cached session", () => {
  beforeEach(() => {
    clearTelegramSession();
  });

  test("reuses a PMS Telegram session while it is still valid", () => {
    saveTelegramSession("session-token", new Date(Date.now() + 60_000).toISOString());

    expect(getCachedTelegramSession()).toBe("session-token");
  });

  test("clears an expired PMS Telegram session instead of reusing it", () => {
    saveTelegramSession("expired-token", new Date(Date.now() - 60_000).toISOString());

    expect(getCachedTelegramSession()).toBeNull();
    expect(sessionStorage.getItem("dse.telegram.session")).toBeNull();
    expect(sessionStorage.getItem("dse.telegram.session.expires")).toBeNull();
  });

  test("keeps backward-compatible sessions that have no explicit expiry", () => {
    saveTelegramSession("legacy-session-token");

    expect(getCachedTelegramSession()).toBe("legacy-session-token");
  });
});
