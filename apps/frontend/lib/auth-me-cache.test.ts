import { describe, expect, test } from "bun:test";
import { createAuthMeCache } from "./auth-me-cache";

describe("createAuthMeCache", () => {
  test("shares and retains a successful account lookup until cleared", async () => {
    let calls = 0;
    const cache = createAuthMeCache(async () => {
      calls += 1;
      return { id: calls };
    });

    const first = cache.get();
    const second = cache.get();

    expect(first).toBe(second);
    expect(await first).toEqual({ id: 1 });
    expect(await cache.get()).toEqual({ id: 1 });
    expect(calls).toBe(1);

    cache.clear();
    expect(await cache.get()).toEqual({ id: 2 });
    expect(calls).toBe(2);
  });

  test("drops a rejected lookup so the next retry starts fresh work", async () => {
    let calls = 0;
    const cache = createAuthMeCache(async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary backend failure");
      return { id: "verified" };
    });

    await expect(cache.get()).rejects.toThrow("temporary backend failure");
    expect(await cache.get()).toEqual({ id: "verified" });
    expect(calls).toBe(2);
  });
});
