import { describe, expect, test } from "bun:test";
import { validateStagingTarget, verifyStagingDatabase } from "./verify-staging-db.ts";

const valid: NodeJS.ProcessEnv = {
  DSE_STAGING_ENVIRONMENT: "true",
  DSE_STAGING_DB_HOST: "ep-dse-stage-pooler.ap-southeast-1.aws.neon.tech",
  DSE_STAGING_DB_NAME: "neondb",
  DSE_STAGING_DB_MARKER: "DSE-PMS-STAGING:isolated-2026-11-06",
  DSE_STAGING_FORBIDDEN_DB_HOSTS: [
    "db.production.example.supabase.co",
    "db.personal.example.supabase.co",
  ].join(","),
  DATABASE_URL: "postgresql://stage:synthetic-test-password@ep-dse-stage-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&schema=public",
};

describe("#1290 staging database guard (does not connect or modify any database)", () => {
  test("accepts a marked independent Neon database target with TLS", async () => {
    const config = validateStagingTarget(valid);
    await expect(verifyStagingDatabase(config, async () => ({
      databaseName: "neondb",
      databaseMarker: "DSE-PMS-STAGING:isolated-2026-11-06",
    }))).resolves.toBeUndefined();
  });

  test("rejects missing safety settings and accidental non-staging runs", () => {
    for (const key of [
      "DSE_STAGING_ENVIRONMENT", "DSE_STAGING_DB_HOST",
      "DSE_STAGING_DB_NAME", "DSE_STAGING_DB_MARKER",
      "DSE_STAGING_FORBIDDEN_DB_HOSTS", "DATABASE_URL",
    ]) {
      expect(() => validateStagingTarget({ ...valid, [key]: undefined })).toThrow();
    }
    expect(() => validateStagingTarget({ ...valid, DSE_STAGING_ENVIRONMENT: "false" })).toThrow();
  });

  test("refuses production, localhost, non-TLS and wrong-database URLs", () => {
    const base = "postgresql://stage:test@";
    for (const connectionString of [
      base + "db.production.example.supabase.co/neondb?sslmode=require",
      base + "db.personal.example.supabase.co/neondb?sslmode=require",
      base + "localhost/neondb?sslmode=require",
      base + "ep-dse-stage-pooler.ap-southeast-1.aws.neon.tech/prod?sslmode=require",
      base + "ep-dse-stage-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=disable",
      base + "ep-dse-stage-pooler.ap-southeast-1.aws.neon.tech/neondb",
      base + "ep-dse-stage-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&schema=staging",
    ]) {
      expect(() => validateStagingTarget({ ...valid, DATABASE_URL: connectionString })).toThrow();
    }
  });

  test("rejects a staged host accidentally in the production denylist", () => {
    expect(() => validateStagingTarget({
      ...valid,
      DSE_STAGING_FORBIDDEN_DB_HOSTS: valid.DSE_STAGING_DB_HOST,
    })).toThrow();
  });

  test("rejects unmarked, wrong-marker and wrong-name databases", async () => {
    const config = validateStagingTarget(valid);
    for (const row of [
      { databaseName: "neondb", databaseMarker: null },
      { databaseName: "neondb", databaseMarker: "other marker" },
      { databaseName: "production", databaseMarker: config.expectedMarker },
    ]) {
      await expect(verifyStagingDatabase(config, async () => row)).rejects.toThrow();
    }
  });

  test("never embeds production database URLs in validation errors", () => {
    const url = "postgresql://user:SECRET@db.production.example.supabase.co/live?sslmode=require";
    try {
      validateStagingTarget({ ...valid, DATABASE_URL: url });
      throw new Error("Should have rejected production URL");
    } catch (error) {
      expect(String(error)).not.toContain("SECRET");
      expect(String(error)).not.toContain(url);
    }
  });
});
