import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./auth-guard.tsx", import.meta.url)),
  "utf8",
);

describe("AuthGuard recovery UI", () => {
  test("keeps protected children behind account verification and exposes recovery actions", () => {
    expect(source).toContain("if (meError || !me)");
    expect(source).toContain(">Retry<");
    expect(source).toContain("Sign in again");
    expect(source).toContain("getSupabase().auth.signOut()");
    expect(source.indexOf("if (meError || !me)")).toBeLessThan(source.indexOf("return <>{children}</>"));
  });
});
