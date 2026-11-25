import { describe, expect, test } from "bun:test";
import { validateProductionAuthConfig } from "./auth-config.mjs";

function env(values) {
  return { ...values };
}

describe("validateProductionAuthConfig", () => {

  test("registration UAT accepts only its exact preview API and issuer", () => {
    const safe = {
      NODE_ENV: "production", VERCEL_ENV: "preview",
      DSE_REGISTRATION_UAT: "true", NEXT_PUBLIC_STAGING_MODE: "true",
      NEXT_PUBLIC_AUTH_MODE: "neon-staging",
      NEXT_PUBLIC_API_URL: "https://dse-pms-telegram1364-uat.onrender.com",
      NEXT_PUBLIC_NEON_AUTH_BASE_URL: "https://ep-solitary-block-a1hm2c16.neonauth.ap-southeast-1.aws.neon.tech/neondb/auth",
    };
    expect(() => validateProductionAuthConfig(safe)).not.toThrow();
    for (const overrides of [
      { VERCEL_ENV: "production" }, { VERCEL_ENV: undefined },
      { DSE_REGISTRATION_UAT: undefined }, { NEXT_PUBLIC_STAGING_MODE: "false" },
      { NEXT_PUBLIC_API_URL: "https://dse-pms-staging-isolated-free.onrender.com" },
      { NEXT_PUBLIC_NEON_AUTH_BASE_URL: "https://ep-purple-scene-a1py5uzt.neonauth.ap-southeast-1.aws.neon.tech/neondb/auth" },
    ]) {
      expect(() => validateProductionAuthConfig({ ...safe, ...overrides })).toThrow();
    }
  });

  test("does nothing outside production", () => {
    expect(() => validateProductionAuthConfig(env({ NODE_ENV: "development" }))).not.toThrow();
  });

  test("rejects a missing production auth mode", () => {
    expect(() => validateProductionAuthConfig(env({ NODE_ENV: "production" }))).toThrow(
      "Production frontend builds require NEXT_PUBLIC_AUTH_MODE=supabase",
    );
  });

  test("rejects development auth in production", () => {
    expect(() =>
      validateProductionAuthConfig(env({ NODE_ENV: "production", NEXT_PUBLIC_AUTH_MODE: "dev" })),
    ).toThrow("Production frontend builds require NEXT_PUBLIC_AUTH_MODE=supabase");
  });

  test("rejects a configured development token in production", () => {
    expect(() =>
      validateProductionAuthConfig(
        env({
          NODE_ENV: "production",
          NEXT_PUBLIC_AUTH_MODE: "supabase",
          NEXT_PUBLIC_DEV_TOKEN: "legacy-shared-token",
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
        }),
      ),
    ).toThrow("NEXT_PUBLIC_DEV_TOKEN must not be configured");
  });

  test("requires Supabase public configuration in production", () => {
    expect(() =>
      validateProductionAuthConfig(
        env({
          NODE_ENV: "production",
          NEXT_PUBLIC_AUTH_MODE: "supabase",
        }),
      ),
    ).toThrow("Production frontend builds require NEXT_PUBLIC_SUPABASE_URL");
  });

  test("accepts a safe production Supabase configuration", () => {
    expect(() =>
      validateProductionAuthConfig(
        env({
          NODE_ENV: "production",
          NEXT_PUBLIC_AUTH_MODE: "supabase",
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
        }),
      ),
    ).not.toThrow();
  });
});
