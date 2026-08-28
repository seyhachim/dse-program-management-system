type InflightFactory<T> = () => Promise<T>;

/**
 * Coalesces only currently-running GET work. Completed values are never cached,
 * so a later request always reaches the backend and sees fresh authorization and
 * academic state.
 */
export function createInflightGetDeduper() {
  const inflight = new Map<string, Promise<unknown>>();

  return function run<T>(key: string, factory: InflightFactory<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;

    const pending = factory();
    inflight.set(key, pending);

    const clear = () => {
      if (inflight.get(key) === pending) inflight.delete(key);
    };
    void pending.then(clear, clear);

    return pending;
  };
}
