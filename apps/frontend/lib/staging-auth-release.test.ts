import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (file: string) => readFileSync(join(import.meta.dir, file), "utf8");

describe("Neon staging authentication release guardrails", () => {
  test("uses the Better Auth JWT endpoint, never the opaque session identifier as an API bearer", () => {
    const text = source("staging-auth.ts");
    expect(text).toContain("/staging-auth/token");
    expect(text).toContain('credentials: "same-origin"');
    expect(text).toContain('cache: "no-store"');
    expect(text).toContain('token.split(".").length === 3');
    expect(text).not.toContain("return sessionToken");
  });

  test("broadcasts session changes across tabs without persisting protected identities", () => {
    const text = source("staging-auth.ts");
    expect(text).toContain("new BroadcastChannel(IDENTITY_CHANGE_CHANNEL)");
    expect(text).toContain("window.dispatchEvent(new Event(IDENTITY_CHANGE_EVENT))");
    expect(text).not.toContain("localStorage.setItem(");
  });

  test("does not redirect valid but unprovisioned Neon sessions into a login loop", () => {
    const text = source("api.ts");
    expect(text).toContain("hasProviderSession = Boolean(data?.session)");
    expect(text).toContain('if (hasProviderSession) {');
    expect(text.indexOf("if (hasProviderSession) {")).toBeLessThan(
      text.indexOf('window.location.replace("/login")', text.indexOf("if (hasProviderSession) {")),
    );
  });
});
