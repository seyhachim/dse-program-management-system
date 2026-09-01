import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CreateGuardianRelationshipInput,
  GuardianRelationshipListQuery,
  INVITABLE_ROLES,
  Role,
} from "@dse-pms/shared-types";
import { PROGRAMME_WIDE_ROLES } from "../../core/auth/token.ts";

test("guardian is an invitable coarse role but never a programme-wide role", () => {
  expect(Role.parse("guardian")).toBe("guardian");
  expect(INVITABLE_ROLES).toContain("guardian");
  expect(PROGRAMME_WIDE_ROLES).not.toContain("guardian");
});

test("guardian relationship contract requires explicit scopes and valid effective dates", () => {
  const parsed = CreateGuardianRelationshipInput.parse({
    guardianUserId: "11111111-1111-4111-8111-111111111111",
    studentId: "22222222-2222-4222-8222-222222222222",
    programmeId: "dse",
    relationshipType: "MOTHER",
    accessScopes: ["attendance", "attendance", "official_results"],
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveTo: "2027-09-01T00:00:00.000Z",
  });

  expect(parsed.accessScopes).toEqual(["attendance", "official_results"]);
  expect(CreateGuardianRelationshipInput.safeParse({
    ...parsed,
    effectiveTo: "2026-08-31T00:00:00.000Z",
  }).success).toBe(false);
  expect(CreateGuardianRelationshipInput.safeParse({
    ...parsed,
    accessScopes: [],
  }).success).toBe(false);
});

test("guardian list query parses boolean strings without truthiness coercion", () => {
  expect(GuardianRelationshipListQuery.parse({
    programmeId: "dse",
    includeInactive: "false",
  }).includeInactive).toBe(false);
  expect(GuardianRelationshipListQuery.parse({
    programmeId: "dse",
    includeInactive: "true",
  }).includeInactive).toBe(true);
  expect(GuardianRelationshipListQuery.parse({ programmeId: "dse" }).includeInactive).toBe(false);
});

test("guardian lifecycle writes are guarded against concurrent state and overlap races", () => {
  const servicePath = fileURLToPath(new URL("./service.ts", import.meta.url));
  const service = readFileSync(servicePath, "utf8");

  expect(service).toContain("pg_advisory_xact_lock");
  expect(service).toContain('WHERE "id" = ${id} AND "status" = \'PENDING\'');
  expect(service).toContain('WHERE "id" = ${id} AND "status" IN (\'PENDING\', \'VERIFIED\')');
  expect(service).toContain("if (changed !== 1)");
});

test("guardian persistence stays outside the public schema and blocks Data API roles", () => {
  const migrationPath = fileURLToPath(new URL(
    "../../../prisma/migrations/20260901133000_add_guardian_relationship_foundation/migration.sql",
    import.meta.url,
  ));
  const migration = readFileSync(migrationPath, "utf8");

  expect(migration).toContain('CREATE SCHEMA IF NOT EXISTS "guardian_portal"');
  expect(migration).toContain('"guardian_portal"."StudentGuardianRelationship"');
  expect(migration).toContain("'anon', 'authenticated', 'service_role'");
  expect(migration).toContain("GuardianRelationshipAuditEvent_no_update");
  expect(migration).toContain("GuardianRelationshipAuditEvent_no_delete");
  expect(migration).not.toContain('CREATE TABLE "public"."StudentGuardianRelationship"');
});
