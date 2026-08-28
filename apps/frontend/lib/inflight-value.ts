export type InflightLoader<T> = (load: () => Promise<T>) => Promise<T>;

/**
 * Coalesces only currently-running work. The resolved value is never retained,
 * so a later call starts fresh work instead of creating a stale cache.
 */
export function createInflightLoader<T>(): InflightLoader<T> {
  let inflight: Promise<T> | null = null;

  return (load) => {
    if (inflight) return inflight;

    const current = load();
    inflight = current;
    void current.finally(() => {
      if (inflight === current) inflight = null;
    }).catch(() => {
      // The caller observes the original rejection; this branch only prevents
      // the cleanup promise created by finally() from becoming unhandled.
    });
    return current;
  };
}
