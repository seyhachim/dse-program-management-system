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

const neonStaging = {
  NODE_ENV: "production",
  AUTH_MODE: "neon-staging",
  DSE_STAGING_ENVIRONMENT: "true",
  DSE_STAGING_DB_HOST: "ep-purple-scene-a1py5uzt.ap-southeast-1.aws.neon.tech",
  DSE_STAGING_DB_NAME: "neondb",
  DSE_STAGING_DB_MARKER: "DSE-PMS-STAGING:20261107-neon-verified-01",
  DATABASE_URL: "postgresql://test:synthetic@ep-purple-scene-a1py5uzt.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
  NEON_AUTH_BASE_URL: "https://ep-purple-scene-a1py5uzt.neonauth.ap-southeast-1.aws.neon.tech/neondb/auth",
  CORS_ORIGIN: "https://staging-preview.example.com",
};

describe("staging-only Neon auth — production Supabase is unaffected", () => {
  test("accepts the exact isolated Neon DB/issuer and never requires Supabase keys", () => {
    expect(resolveAuthConfig(env(neonStaging))).toEqual({
      mode: "neon-staging",
      neonAuthBaseUrl: neonStaging.NEON_AUTH_BASE_URL,
    });
  });

  test("rejects any missing staging safety gate", () => {
    for (const key of [
      "DSE_STAGING_ENVIRONMENT", "DSE_STAGING_DB_HOST",
      "DSE_STAGING_DB_NAME", "DSE_STAGING_DB_MARKER",
      "DATABASE_URL", "NEON_AUTH_BASE_URL", "CORS_ORIGIN",
    ]) {
      expect(() => resolveAuthConfig(env({ ...neonStaging, [key]: undefined }))).toThrow();
    }
  });

  test("rejects production Supabase database and credentials", () => {
    const variants = [
      { DSE_STAGING_ENVIRONMENT: "false" },
      { DSE_STAGING_DB_MARKER: "DSE-PMS-STAGING:attacker-marker" },
      { DATABASE_URL: "postgresql://test:test@db.production.supabase.co/postgres?sslmode=require" },
      { NEON_AUTH_BASE_URL: "https://attacker.invalid/auth" },
      { CORS_ORIGIN: "*" },
      { SUPABASE_SERVICE_ROLE_KEY: "test-service-key" },
      { SUPABASE_URL: "https://production.supabase.co" },
    ];
    for (const override of variants) {
      expect(() => resolveAuthConfig(env({ ...neonStaging, ...override }))).toThrow();
    }
  });
});
