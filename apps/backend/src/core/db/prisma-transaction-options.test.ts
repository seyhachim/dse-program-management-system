import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("Prisma interactive transaction defaults", () => {
  test("allow bounded full-class attendance transactions beyond Prisma's 5s default", () => {
    const source = readFileSync(new URL("./prisma.ts", import.meta.url), "utf8");

    expect(source).toContain("transactionOptions");
    expect(source).toContain("maxWait: 5_000");
    expect(source).toContain("timeout: 30_000");
  });
});
