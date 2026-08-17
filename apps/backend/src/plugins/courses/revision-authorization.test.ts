import { describe, expect, test } from "bun:test";
import type { AuthUser, Role } from "../../core/auth/token.ts";
import { canCreateCourseSpecRevision } from "./revision-authorization.ts";

function user(
  role: Role,
  programmeId: string | null,
): AuthUser {
  return {
    id: crypto.randomUUID(),
    email: `${role}@dse.test`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("course spec revision governance authorization", () => {
  test("global admin may create a revision", () => {
    expect(canCreateCourseSpecRevision(user("admin", null), "dse")).toBe(true);
  });

  test("programme coordinator may create a revision in their programme", () => {
    expect(
      canCreateCourseSpecRevision(user("program_coordinator", "dse"), "dse"),
    ).toBe(true);
  });

  test("programme coordinator may not cross programme scope", () => {
    expect(
      canCreateCourseSpecRevision(user("program_coordinator", "other"), "dse"),
    ).toBe(false);
  });

  test("programme secretary is not academic revision authority", () => {
    expect(
      canCreateCourseSpecRevision(user("program_secretary", "dse"), "dse"),
    ).toBe(false);
  });

  test("lecturer is not academic revision authority", () => {
    expect(canCreateCourseSpecRevision(user("lecturer", "dse"), "dse")).toBe(false);
  });
});
