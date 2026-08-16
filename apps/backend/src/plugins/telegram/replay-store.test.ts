import { describe, expect, test } from "bun:test";
import {
  TelegramInitDataReplayError,
  createTelegramReplayStore,
} from "./replay-store.ts";

const input = {
  rawInitData: "auth_date=1&user=%7B%22id%22%3A123%7D&hash=abc",
  telegramUserId: "123",
  queryId: "query-1",
  authDate: new Date("2026-08-16T05:00:00.000Z"),
  expiresAt: new Date("2026-08-16T05:05:00.000Z"),
};

describe("Telegram replay store", () => {
  test("stores only a digest and returns a verification id", async () => {
    let persisted: unknown;
    const store = createTelegramReplayStore(async (record) => {
      persisted = record;
      return true;
    });

    const result = await store.record(input);
    expect(result.verificationId).toBeTruthy();
    expect(result.initDataDigest).toMatch(/^[0-9a-f]{64}$/);
    expect((persisted as { initDataDigest: string }).initDataDigest).toBe(
      result.initDataDigest,
    );
    expect(JSON.stringify(persisted)).not.toContain(input.rawInitData);
  });

  test("maps a duplicate digest to a replay error", async () => {
    const seen = new Set<string>();
    const store = createTelegramReplayStore(async (record) => {
      if (seen.has(record.initDataDigest)) return false;
      seen.add(record.initDataDigest);
      return true;
    });

    await store.record(input);
    await expect(store.record(input)).rejects.toBeInstanceOf(TelegramInitDataReplayError);
  });

  test("allows the same Telegram user to present a distinct fresh launch", async () => {
    const seen = new Set<string>();
    const store = createTelegramReplayStore(async (record) => {
      if (seen.has(record.initDataDigest)) return false;
      seen.add(record.initDataDigest);
      return true;
    });

    await expect(store.record(input)).resolves.toBeTruthy();
    await expect(
      store.record({ ...input, rawInitData: `${input.rawInitData}&query_id=query-2`, queryId: "query-2" }),
    ).resolves.toBeTruthy();
    expect(seen.size).toBe(2);
  });

  test("concurrent duplicate attempts produce exactly one success", async () => {
    const seen = new Set<string>();
    const store = createTelegramReplayStore(async (record) => {
      await Promise.resolve();
      if (seen.has(record.initDataDigest)) return false;
      seen.add(record.initDataDigest);
      return true;
    });

    const results = await Promise.allSettled([store.record(input), store.record(input)]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
  });
});
