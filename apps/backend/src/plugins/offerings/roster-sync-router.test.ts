import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./roster-sync-router.ts", import.meta.url), "utf8");

describe("roster sync route authorization", () => {
  test("requires manage permission and programme-wide role scope", () => {
    expect(source).toContain('requirePermission("offerings:manage")');
    expect(source).toContain("hasAnyRoleInProgramme");
    expect(source).toContain('"admin", "program_coordinator", "program_secretary"');
  });

  test("exposes separate preview and explicit apply routes", () => {
    expect(source).toContain('"/roster-sync/preview"');
    expect(source).toContain('"/roster-sync/apply"');
    expect(source).toContain("RosterSyncBlockedError");
  });
});
