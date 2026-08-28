import { describe, expect, test } from "bun:test";
import { createInflightGetDeduper } from "./inflight-get";

describe("createInflightGetDeduper", () => {
  test("coalesces identical concurrent work and clears after success", async () => {
    const run = createInflightGetDeduper();
    let calls = 0;
    let resolveFirst!: (value: number) => void;

    const firstFactory = () => {
      calls += 1;
      return new Promise<number>((resolve) => {
        resolveFirst = resolve;
      });
    };

    const first = run("/api/example", firstFactory);
    const second = run("/api/example", firstFactory);

    expect(first).toBe(second);
    expect(calls).toBe(1);

    resolveFirst(42);
    expect(await first).toBe(42);
    expect(await second).toBe(42);

    const later = run("/api/example", async () => {
      calls += 1;
      return 43;
    });

    expect(await later).toBe(43);
    expect(calls).toBe(2);
  });

  test("shares errors only while the request is in flight", async () => {
    const run = createInflightGetDeduper();
    let calls = 0;
    let rejectFirst!: (reason: Error) => void;

    const firstFactory = () => {
      calls += 1;
      return new Promise<number>((_resolve, reject) => {
        rejectFirst = reject;
      });
    };

    const first = run("/api/failing", firstFactory);
    const second = run("/api/failing", firstFactory);
    rejectFirst(new Error("boom"));

    const outcomes = await Promise.allSettled([first, second]);
    expect(calls).toBe(1);
    expect(outcomes.every((result) => result.status === "rejected")).toBe(true);

    await run("/api/failing", async () => {
      calls += 1;
      return 7;
    });
    expect(calls).toBe(2);
  });

  test("does not combine different keys", async () => {
    const run = createInflightGetDeduper();
    let calls = 0;

    const [a, b] = await Promise.all([
      run("/api/a", async () => {
        calls += 1;
        return "a";
      }),
      run("/api/b", async () => {
        calls += 1;
        return "b";
      }),
    ]);

    expect([a, b]).toEqual(["a", "b"]);
    expect(calls).toBe(2);
  });
});
