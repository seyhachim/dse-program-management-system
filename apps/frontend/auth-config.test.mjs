import { describe, expect, test } from "bun:test";
import { validateProductionAuthConfig } from "./auth-config.mjs";

function env(values) {
  return { ...values };
}

describe("validateProductionAuthConfig", () => {
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
