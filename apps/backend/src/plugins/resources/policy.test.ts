import { describe, expect, test } from "bun:test";
import type { AuthUser, Role } from "../../core/auth/token.ts";
import { capabilitiesForResourceContext } from "./policy.ts";

function user(role: Role, programmeId: string | null = "dse"): AuthUser {
  return {
    id: crypto.randomUUID(),
    email: `${role}@example.test`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("resource capability policy", () => {
  test("programme coordinator and global admin receive approval authority", () => {
    expect(
      capabilitiesForResourceContext(user("program_coordinator"), "dse", []),
    ).toEqual([
      "inventory:read",
      "inventory:write",
      "inventory:receive",
      "inventory:approve",
      "inventory:maintain",
    ]);

    expect(
      capabilitiesForResourceContext(user("admin", null), "another-programme", []),
    ).toContain("inventory:approve");
  });

  test("secretary stays read-only until assigned Resource Coordinator", () => {
    const secretary = user("program_secretary");
    expect(capabilitiesForResourceContext(secretary, "dse", [])).toEqual([
      "inventory:read",
    ]);

    const assigned = capabilitiesForResourceContext(secretary, "dse", [
      "RESOURCE_COORDINATOR",
    ]);
    expect(assigned).toContain("inventory:write");
    expect(assigned).toContain("inventory:receive");
    expect(assigned).toContain("inventory:maintain");
    expect(assigned).not.toContain("inventory:approve");
  });

  test("Lab Custodian can maintain but cannot change stock or approve", () => {
    const lecturer = user("lecturer");
    const capabilities = capabilitiesForResourceContext(lecturer, "dse", [
      "LAB_CUSTODIAN",
    ]);
    expect(capabilities).toEqual(["inventory:read", "inventory:maintain"]);
    expect(capabilities).not.toContain("inventory:write");
    expect(capabilities).not.toContain("inventory:receive");
    expect(capabilities).not.toContain("inventory:approve");
  });

  test("programme scope fails closed", () => {
    const secretary = user("program_secretary", "programme-a");
    expect(
      capabilitiesForResourceContext(secretary, "programme-b", []),
    ).toEqual([]);
  });
});
