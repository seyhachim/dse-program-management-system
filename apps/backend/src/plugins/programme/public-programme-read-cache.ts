type CacheClock = () => number;

type CacheEntry = {
  scope: string;
  expiresAt: number;
  promise: Promise<unknown>;
};

export interface AsyncTtlCacheOptions {
  defaultTtlMs: number;
  maxEntries?: number;
  now?: CacheClock;
}

export interface AsyncTtlCache {
  get<T>(
    scope: string,
    key: string,
    loader: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T>;
  invalidateScope(scope: string): void;
  clear(): void;
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

export function createAsyncTtlCache(
  options: AsyncTtlCacheOptions,
): AsyncTtlCache {
  assertPositiveInteger("defaultTtlMs", options.defaultTtlMs);
  const maxEntries = options.maxEntries ?? 256;
  assertPositiveInteger("maxEntries", maxEntries);
  const now = options.now ?? Date.now;
  const entries = new Map<string, CacheEntry>();

  function compositeKey(scope: string, key: string): string {
    return `${scope}\u0000${key}`;
  }

  function evictOldestIfNeeded(): void {
    while (entries.size >= maxEntries) {
      const oldestKey = entries.keys().next().value as string | undefined;
      if (!oldestKey) return;
      entries.delete(oldestKey);
    }
  }

  return {
    async get<T>(
      scope: string,
      key: string,
      loader: () => Promise<T>,
      ttlMs = options.defaultTtlMs,
    ): Promise<T> {
      assertPositiveInteger("ttlMs", ttlMs);
      const fullKey = compositeKey(scope, key);
      const current = entries.get(fullKey);
      const currentTime = now();
      if (current && current.expiresAt > currentTime) {
        return current.promise as Promise<T>;
      }
      if (current) entries.delete(fullKey);

      evictOldestIfNeeded();
      const promise = Promise.resolve().then(loader);
      const entry: CacheEntry = {
        scope,
        expiresAt: currentTime + ttlMs,
        promise,
      };
      entries.set(fullKey, entry);

      try {
        return await promise;
      } catch (error) {
        if (entries.get(fullKey) === entry) entries.delete(fullKey);
        throw error;
      }
    },

    invalidateScope(scope: string): void {
      for (const [key, entry] of entries) {
        if (entry.scope === scope) entries.delete(key);
      }
    },

    clear(): void {
      entries.clear();
    },
  };
}
