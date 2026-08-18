import { describe, expect, test } from "bun:test";
import { canonicalize } from "./version-history-service.ts";

describe("course specification version comparison", () => {
  test("canonicalization is deterministic for object key order", () => {
    const a = { z: 1, nested: { b: 2, a: 1 }, rows: [{ b: 2, a: 1 }] };
    const b = { rows: [{ a: 1, b: 2 }], nested: { a: 1, b: 2 }, z: 1 };
    expect(JSON.stringify(canonicalize(a))).toBe(JSON.stringify(canonicalize(b)));
  });

  test("array order remains meaningful academic content", () => {
    const a = canonicalize({ items: [{ id: "a" }, { id: "b" }] });
    const b = canonicalize({ items: [{ id: "b" }, { id: "a" }] });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});
