import { describe, expect, test } from "bun:test";
import { createAsyncTtlCache } from "./public-programme-read-cache.ts";

describe("public programme async TTL cache", () => {
  test("serves repeated reads from cache until TTL expiry", async () => {
    let now = 1_000;
    let loads = 0;
    const cache = createAsyncTtlCache({
      defaultTtlMs: 100,
      now: () => now,
    });

    const load = async () => {
      loads += 1;
      return `value-${loads}`;
    };

    expect(await cache.get("programme:dse", "faqs:en", load)).toBe("value-1");
    expect(await cache.get("programme:dse", "faqs:en", load)).toBe("value-1");
    expect(loads).toBe(1);

    now += 101;
    expect(await cache.get("programme:dse", "faqs:en", load)).toBe("value-2");
    expect(loads).toBe(2);
  });

  test("deduplicates concurrent cache misses", async () => {
    let loads = 0;
    let release!: (value: string) => void;
    const deferred = new Promise<string>((resolve) => {
      release = resolve;
    });
    const cache = createAsyncTtlCache({ defaultTtlMs: 1_000 });
    const load = async () => {
      loads += 1;
      return deferred;
    };

    const first = cache.get("programme:dse", "faqs:en", load);
    const second = cache.get("programme:dse", "faqs:en", load);
    expect(loads).toBe(1);

    release("published");
    expect(await first).toBe("published");
    expect(await second).toBe("published");
    expect(loads).toBe(1);
  });

  test("programme invalidation removes only that programme scope", async () => {
    let loads = 0;
    const cache = createAsyncTtlCache({ defaultTtlMs: 1_000 });
    const load = async () => {
      loads += 1;
      return loads;
    };

    expect(await cache.get("programme:dse", "faqs:en", load)).toBe(1);
    expect(await cache.get("programme:dse", "faqs:km", load)).toBe(2);
    expect(await cache.get("programme:other", "faqs:en", load)).toBe(3);

    cache.invalidateScope("programme:dse");

    expect(await cache.get("programme:dse", "faqs:en", load)).toBe(4);
    expect(await cache.get("programme:dse", "faqs:km", load)).toBe(5);
    expect(await cache.get("programme:other", "faqs:en", load)).toBe(3);
  });

  test("does not retain loader failures", async () => {
    let attempts = 0;
    const cache = createAsyncTtlCache({ defaultTtlMs: 1_000 });
    const load = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary failure");
      return "recovered";
    };

    await expect(cache.get("programme:dse", "profile:en", load)).rejects.toThrow(
      "temporary failure",
    );
    expect(await cache.get("programme:dse", "profile:en", load)).toBe(
      "recovered",
    );
    expect(attempts).toBe(2);
  });

  test("evicts oldest entries when the bounded cache is full", async () => {
    let loads = 0;
    const cache = createAsyncTtlCache({
      defaultTtlMs: 1_000,
      maxEntries: 2,
    });
    const load = async () => {
      loads += 1;
      return loads;
    };

    expect(await cache.get("programme:dse", "one", load)).toBe(1);
    expect(await cache.get("programme:dse", "two", load)).toBe(2);
    expect(await cache.get("programme:dse", "three", load)).toBe(3);
    expect(await cache.get("programme:dse", "one", load)).toBe(4);
  });
});
