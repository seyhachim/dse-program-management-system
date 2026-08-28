import { describe, expect, test } from "bun:test";
import { createInflightLoader } from "./inflight-value";

describe("createInflightLoader", () => {
  test("shares concurrent work but does not cache the completed value", async () => {
    const run = createInflightLoader<number>();
    let calls = 0;
    let resolve!: (value: number) => void;
    const pending = new Promise<number>((done) => {
      resolve = done;
    });

    const first = run(() => {
      calls += 1;
      return pending;
    });
    const second = run(() => {
      calls += 1;
      return Promise.resolve(99);
    });

    expect(calls).toBe(1);
    expect(first).toBe(second);
    resolve(42);
    await expect(first).resolves.toBe(42);
    await Promise.resolve();

    await expect(run(async () => {
      calls += 1;
      return 7;
    })).resolves.toBe(7);
    expect(calls).toBe(2);
  });

  test("clears rejected work so a later call can retry", async () => {
    const run = createInflightLoader<number>();
    let calls = 0;

    const first = run(async () => {
      calls += 1;
      throw new Error("temporary");
    });
    const second = run(async () => {
      calls += 1;
      return 2;
    });

    expect(first).toBe(second);
    await expect(first).rejects.toThrow("temporary");
    await Promise.resolve();

    await expect(run(async () => {
      calls += 1;
      return 3;
    })).resolves.toBe(3);
    expect(calls).toBe(2);
  });
});
