import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const handler = readFileSync(join(import.meta.dir, "[...path]/route.ts"), "utf8");
const config = readFileSync(join(import.meta.dir, "../../next.config.mjs"), "utf8");

describe("staging auth first-party proxy is fail-closed", () => {
  test("never exposes a broad production Neon rewrite", () => {
    expect(config).not.toContain('source: "/staging-auth/:path*"');
    expect(handler).toContain('process.env.VERCEL_ENV === "preview"');
    expect(handler).toContain('process.env.NEXT_PUBLIC_STAGING_MODE === "true"');
    expect(handler).toContain('process.env.NEXT_PUBLIC_AUTH_MODE === "neon-staging"');
    expect(handler).toContain('request.headers.get("host") === STAGING_HOST');
  });

  test("allows only explicit session/login paths and methods", () => {
    for (const path of ["get-session", "token", "sign-in/email", "sign-up/email", "sign-out"]) {
      expect(handler).toContain(path);
    }
    expect(handler).toContain("ALLOWED[action] !== request.method");
    expect(handler).toContain('origin !== STAGING_ORIGIN');
  });

  test("does not forward user-controlled proxy host headers to Neon", () => {
    expect(handler).toContain("const headers = new Headers()");
    expect(handler).not.toContain('headers.set("Host"');
    expect(handler).not.toContain('headers.set("X-Forwarded-Host"');
    expect(handler).not.toContain('headers.set("X-Forwarded-Proto"');
    expect(handler).toContain('redirect: "manual"');
    expect(handler).toContain('upstream.headers.getSetCookie()');
    expect(handler).toContain('"Cache-Control": "private, no-store, max-age=0"');
  });
});
