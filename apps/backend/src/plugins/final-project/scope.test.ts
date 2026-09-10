import { describe, expect, test } from "bun:test";
import type { AuthUser, Role } from "../../core/auth/token.ts";
import {
  canManageFinalProject,
  canReadFinalProject,
  canWriteOwnSupervisorProfile,
} from "./scope.ts";

function user(role: Role, programmeId: string | null): AuthUser {
  return {
    id: `${role}-test-user`,
    email: `${role}@example.test`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("final project programme scope", () => {
  test("student and lecturer reads stay inside their assigned programme", () => {
    expect(canReadFinalProject(user("student", "dse"), "dse")).toBe(true);
    expect(canReadFinalProject(user("student", "other"), "dse")).toBe(false);
    expect(canReadFinalProject(user("lecturer", "dse"), "dse")).toBe(true);
    expect(canReadFinalProject(user("lecturer", "other"), "dse")).toBe(false);
  });

  test("only an in-programme lecturer can edit an own supervisor profile", () => {
    expect(canWriteOwnSupervisorProfile(user("lecturer", "dse"), "dse")).toBe(true);
    expect(canWriteOwnSupervisorProfile(user("lecturer", "other"), "dse")).toBe(false);
    expect(canWriteOwnSupervisorProfile(user("student", "dse"), "dse")).toBe(false);
  });

  test("programme coordinators manage only their programme while global admin manages all", () => {
    expect(canManageFinalProject(user("program_coordinator", "dse"), "dse")).toBe(true);
    expect(canManageFinalProject(user("program_coordinator", "other"), "dse")).toBe(false);
    expect(canManageFinalProject(user("admin", null), "dse")).toBe(true);
    expect(canManageFinalProject(user("lecturer", "dse"), "dse")).toBe(false);
  });
});
