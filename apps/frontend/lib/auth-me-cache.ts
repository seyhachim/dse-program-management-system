export type AuthMeCache<T> = {
  get: () => Promise<T>;
  clear: () => void;
};

/**
 * Shares and retains a successful /me lookup until auth identity changes, while
 * dropping failures so a temporary network/backend error can be retried.
 */
export function createAuthMeCache<T>(load: () => Promise<T>): AuthMeCache<T> {
  let cached: Promise<T> | null = null;

  return {
    get() {
      if (cached) return cached;

      const current = load();
      cached = current;
      void current.catch(() => {
        if (cached === current) cached = null;
      });
      return current;
    },
    clear() {
      cached = null;
    },
  };
}
