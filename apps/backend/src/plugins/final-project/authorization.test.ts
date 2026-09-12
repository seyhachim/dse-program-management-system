import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../core/auth/token.ts";
import {
  canCheckStudentFinalProjectEligibility,
  canEditOwnSupervisorProfile,
  canManageSupervisorOverview,
  canReadSupervisorDiscovery,
} from "./authorization.ts";

function user(
  id: string,
  role: AuthUser["roles"][number],
  programmeId: string | null,
): AuthUser {
  return {
    id,
    email: `${id}@dse.invalid`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("Final Project programme authorization", () => {
  test("student discovery fails closed until eligibility is established", () => {
    const student = user("student-1", "student", "dse");
    expect(canCheckStudentFinalProjectEligibility(student, "dse")).toBe(true);
    expect(canReadSupervisorDiscovery(student, "dse")).toBe(false);
    expect(canReadSupervisorDiscovery(student, "dse", true)).toBe(true);
  });

  test("student discovery remains confined to the student's programme", () => {
    const student = user("student-1", "student", "dse");
    expect(canCheckStudentFinalProjectEligibility(student, "bioeng")).toBe(false);
    expect(canReadSupervisorDiscovery(student, "bioeng", true)).toBe(false);
  });

  test("staff discovery does not depend on student eligibility", () => {
    const lecturer = user("lecturer-1", "lecturer", "dse");
    expect(canReadSupervisorDiscovery(lecturer, "dse")).toBe(true);
    expect(canReadSupervisorDiscovery(lecturer, "bioeng")).toBe(false);
  });

  test("lecturer can edit only their own profile and only in their programme", () => {
    const lecturer = user("lecturer-1", "lecturer", "dse");
    expect(canEditOwnSupervisorProfile(lecturer, "dse", "lecturer-1")).toBe(true);
    expect(canEditOwnSupervisorProfile(lecturer, "dse", "lecturer-2")).toBe(false);
    expect(canEditOwnSupervisorProfile(lecturer, "bioeng", "lecturer-1")).toBe(false);
  });

  test("programme coordinator overview does not cross programme boundaries", () => {
    const coordinator = user("coordinator-1", "program_coordinator", "dse");
    expect(canManageSupervisorOverview(coordinator, "dse")).toBe(true);
    expect(canManageSupervisorOverview(coordinator, "bioeng")).toBe(false);
  });

  test("global admin can manage every programme", () => {
    const admin = user("admin-1", "admin", null);
    expect(canManageSupervisorOverview(admin, "dse")).toBe(true);
    expect(canManageSupervisorOverview(admin, "bioeng")).toBe(true);
    expect(canReadSupervisorDiscovery(admin, "dse")).toBe(true);
  });
});
