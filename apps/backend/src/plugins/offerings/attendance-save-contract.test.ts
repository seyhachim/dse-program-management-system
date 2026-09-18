import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const router = readFileSync(new URL("./router.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("./attendance-service.ts", import.meta.url), "utf8");
const recheck = readFileSync(new URL("./attendance-recheck-service.ts", import.meta.url), "utf8");

describe("attendance optimistic save API contract", () => {
  test("requires an expected server version and maps stale updates to conflict", () => {
    expect(router).toContain("parsedBody.data.expectedUpdatedAt === undefined");
    expect(router).toContain("res.status(428)");
    expect(router).toContain("err instanceof AttendanceSaveConflictError");
    expect(router).toContain("res.status(409)");
  });

  test("checks the version under the attendance row lock before any replacement", () => {
    const lock = service.indexOf("LIMIT 1 FOR UPDATE");
    const guard = service.indexOf("input.expectedUpdatedAt !== undefined");
    const deleteRecords = service.indexOf('DELETE FROM "pms_attendance"."AttendanceRecord"');
    expect(lock).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(lock);
    expect(deleteRecords).toBeGreaterThan(guard);
  });

  test("advances session versions for both saves and Check 2 updates", () => {
    expect(service).toContain('GREATEST(CURRENT_TIMESTAMP, "updatedAt" + INTERVAL');
    expect(recheck).toContain('GREATEST(CURRENT_TIMESTAMP, "updatedAt" + INTERVAL');
  });
});
