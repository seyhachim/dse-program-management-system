import { describe, expect, test } from "bun:test";
import { reconciliationInputPath } from "./annual-lecturer-reconciliation.ts";

describe("annual reconciliation CLI safety", () => {
  test("accepts only a named input path", () => {
    expect(reconciliationInputPath(["--input", "historical.json"])).toBe("historical.json");
  });
  test("rejects commit, apply, production and unknown flags", () => {
    for (const args of [
      [], ["--input"], ["--input", "--commit"], ["--input", "x.json", "--commit"],
      ["--input", "x.json", "--apply"], ["--input", "x.json", "--production"], ["--help"],
    ]) expect(() => reconciliationInputPath(args)).toThrow();
  });
});
