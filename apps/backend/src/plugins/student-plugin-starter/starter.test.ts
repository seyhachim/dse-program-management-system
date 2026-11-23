import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../core/auth/token.ts";
import { canReadStudentPluginStarter } from "./authorization.ts";
import { studentPluginStarterService } from "./service.ts";

function fixture(id: string, role: AuthUser["roles"][number], programmeId: string | null): AuthUser {
  return {
    id,
    email: `${id}@example.invalid`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("Student plugin starter authorization", () => {
  test("student is allowed only in their assigned programme", () => {
    const student = fixture("student-a", "student", "dse");
    expect(canReadStudentPluginStarter(student, "dse")).toBe(true);
    expect(canReadStudentPluginStarter(student, "other-programme")).toBe(false);
  });

  test("lecturer, coordinator and global admin have only their intended scope", () => {
    expect(canReadStudentPluginStarter(fixture("lecturer-a", "lecturer", "dse"), "dse")).toBe(true);
    expect(canReadStudentPluginStarter(fixture("lecturer-a", "lecturer", "dse"), "other-programme")).toBe(false);
    expect(canReadStudentPluginStarter(fixture("coordinator-a", "program_coordinator", "dse"), "other-programme")).toBe(false);
    expect(canReadStudentPluginStarter(fixture("admin-a", "admin", null), "other-programme")).toBe(true);
  });

  test("unrelated role and empty programme are denied", () => {
    expect(canReadStudentPluginStarter(fixture("guardian-a", "guardian", "dse"), "dse")).toBe(false);
    expect(canReadStudentPluginStarter(fixture("student-a", "student", "dse"), "  ")).toBe(false);
  });
});

test("starter service returns no academic, personal or database data", () => {
  expect(studentPluginStarterService.welcome({ programmeId: "dse" })).toEqual({
    programmeId: "dse",
    title: "Student Plugin Starter",
    message: "Fictional training example. No PMS academic data was accessed.",
  });
});
