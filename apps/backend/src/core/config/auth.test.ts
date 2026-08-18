import { describe, expect, test } from "bun:test";
import { resolveAuthConfig } from "./auth.ts";

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...values };
}

describe("resolveAuthConfig", () => {
  test("rejects a missing auth mode", () => {
    expect(() => resolveAuthConfig(env({ NODE_ENV: "development" }))).toThrow(
      "AUTH_MODE must be explicitly set",
    );
  });

  test("rejects an invalid auth mode instead of falling back to dev", () => {
    expect(() => resolveAuthConfig(env({ NODE_ENV: "development", AUTH_MODE: "suapbase" }))).toThrow(
      "AUTH_MODE must be explicitly set",
    );
  });

  test("allows explicit dev auth for local development", () => {
    expect(resolveAuthConfig(env({ NODE_ENV: "development", AUTH_MODE: "dev" }))).toEqual({
      mode: "dev",
    });
  });

  test("allows explicit dev auth for tests", () => {
    expect(resolveAuthConfig(env({ NODE_ENV: "test", AUTH_MODE: "dev" }))).toEqual({
      mode: "dev",
    });
  });

  test("rejects dev auth in production", () => {
    expect(() => resolveAuthConfig(env({ NODE_ENV: "production", AUTH_MODE: "dev" }))).toThrow(
      "Production requires AUTH_MODE=supabase",
    );
  });

  test("requires Supabase JWKS whenever supabase auth is selected", () => {
    expect(() => resolveAuthConfig(env({ NODE_ENV: "development", AUTH_MODE: "supabase" }))).toThrow(
      "SUPABASE_JWKS_URL is required",
    );
  });

  test("requires an HTTPS Supabase JWKS URL in production", () => {
    expect(() =>
      resolveAuthConfig(
        env({
          NODE_ENV: "production",
          AUTH_MODE: "supabase",
          SUPABASE_JWKS_URL: "http://example.supabase.co/auth/v1/.well-known/jwks.json",
        }),
      ),
    ).toThrow("SUPABASE_JWKS_URL must use https in production");
  });

  test("rejects malformed Supabase JWKS URLs in production", () => {
    expect(() =>
      resolveAuthConfig(
        env({
          NODE_ENV: "production",
          AUTH_MODE: "supabase",
          SUPABASE_JWKS_URL: "not-a-url",
        }),
      ),
    ).toThrow("SUPABASE_JWKS_URL must be a valid URL");
  });

  test("accepts explicit production Supabase auth with HTTPS JWKS", () => {
    expect(
      resolveAuthConfig(
        env({
          NODE_ENV: "production",
          AUTH_MODE: "supabase",
          SUPABASE_JWKS_URL: "https://example.supabase.co/auth/v1/.well-known/jwks.json",
        }),
      ),
    ).toEqual({
      mode: "supabase",
      supabaseJwksUrl: "https://example.supabase.co/auth/v1/.well-known/jwks.json",
    });
  });
});
