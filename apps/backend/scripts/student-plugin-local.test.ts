import { describe, expect, test } from "bun:test";
import { validateStudentPluginLocalTarget } from "./student-plugin-local.ts";

const LOCAL: Record<string, string> = {
  DSE_STUDENT_PLUGIN_LOCAL: "true",
  AUTH_MODE: "dev",
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://plugin_dev:fictional-local-password@127.0.0.1:5432/dse_pms_student_plugins?schema=public",
  TELEGRAM_PMS_ENABLED: "false",
  TELEGRAM_PUBLIC_ENABLED: "false",
};

function expectRejected(overrides: Record<string, string | undefined>) {
  const env = { ...LOCAL, ...overrides };
  expect(() => validateStudentPluginLocalTarget(env)).toThrow(/Refusing student-plugin local operation/);
}

describe("student plugin local database safety boundary (#1303)", () => {
  test("accepts named fictional loopback PostgreSQL database", () => {
    expect(validateStudentPluginLocalTarget(LOCAL)).toEqual({
      host: "127.0.0.1",
      database: "dse_pms_student_plugins",
    });
  });

  test("accepts optional non-production local test suffix", () => {
    const env = { ...LOCAL, DATABASE_URL: "postgres://dev:local-secret@localhost:5433/dse_pms_student_plugins_team1" };
    expect(validateStudentPluginLocalTarget(env).database).toBe("dse_pms_student_plugins_team1");
  });

  test("rejects remote hosted or local-tunnel hostnames that are not loopback", () => {
    expectRejected({ DATABASE_URL: "postgresql://dev:password@database.example.com:5432/dse_pms_student_plugins" });
  });

  test("rejects a production-like database name even when host is localhost", () => {
    expectRejected({ DATABASE_URL: "postgresql://dev:password@127.0.0.1:5432/dse_production" });
  });

  test("rejects staging or production auth modes", () => {
    expectRejected({ AUTH_MODE: "supabase" });
    expectRejected({ NODE_ENV: "production" });
    expectRejected({ DSE_STAGING_ENVIRONMENT: "true" });
    expectRejected({ NEXT_PUBLIC_AUTH_MODE: "supabase" });
  });

  test("rejects missing opt-in and missing credentials", () => {
    expectRejected({ DSE_STUDENT_PLUGIN_LOCAL: undefined });
    expectRejected({ DATABASE_URL: "postgresql://127.0.0.1:5432/dse_pms_student_plugins" });
  });

  test("rejects hosted auth/database credentials even if a localhost URL is present", () => {
    expectRejected({ SUPABASE_SERVICE_ROLE_KEY: "never-use-production-secrets" });
    expectRejected({ SUPABASE_URL: "https://example.supabase.co" });
    expectRejected({ DSE_STAGING_DB_HOST: "example.neon.tech" });
  });

  test("rejects query-string host and schema overrides", () => {
    expectRejected({ DATABASE_URL: LOCAL.DATABASE_URL + "&host=example.com" });
    expectRejected({ DATABASE_URL: LOCAL.DATABASE_URL.replace("schema=public", "schema=private") });
    expectRejected({ DATABASE_URL: LOCAL.DATABASE_URL + "&sslmode=require" });
  });

  test("rejects enabled Telegram integrations", () => {
    expectRejected({ TELEGRAM_PUBLIC_ENABLED: "true" });
    expectRejected({ TELEGRAM_PMS_ENABLED: "true" });
  });

  test("never prints sensitive URL contents in refusal messages", () => {
    const privatePassword = "fictionalSuperSecret123";
    const url = `postgresql://dev:${privatePassword}@production.example.com:5432/dse_pms_student_plugins`;
    try {
      validateStudentPluginLocalTarget({ ...LOCAL, DATABASE_URL: url });
      throw new Error("Expected refusal");
    } catch (error) {
      expect((error as Error).message).not.toContain(privatePassword);
      expect((error as Error).message).not.toContain(url);
    }
  });
});
