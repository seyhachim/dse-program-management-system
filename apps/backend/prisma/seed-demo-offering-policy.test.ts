import { describe, expect, test } from "bun:test";
import { shouldSeedDemoOffering } from "./seed-demo-offering-policy.ts";

describe("demo Offering seed boundary", () => {
  test("keeps the sample available for local development and CI databases", () => {
    expect(shouldSeedDemoOffering("postgresql://ci:ci@localhost:5432/dse_ci", false)).toBe(true);
    expect(shouldSeedDemoOffering("postgresql://ci:ci@127.0.0.1:5432/dse_ci", false)).toBe(true);
  });

  test("does not create or reactivate the sample in a remote database by default", () => {
    expect(shouldSeedDemoOffering("postgresql://user:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres", false)).toBe(false);
    expect(shouldSeedDemoOffering(undefined, false)).toBe(false);
    expect(shouldSeedDemoOffering("not-a-database-url", false)).toBe(false);
  });

  test("requires an explicit operator opt-in for a remote test database", () => {
    expect(shouldSeedDemoOffering("postgresql://user:secret@db.example.test:5432/postgres", true)).toBe(true);
  });
});
