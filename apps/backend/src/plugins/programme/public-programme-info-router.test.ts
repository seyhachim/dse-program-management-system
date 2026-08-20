import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../core/auth/token.ts";
import { hasPublicInfoManagementScope } from "./public-programme-info-router.ts";

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    email: "user@example.edu",
    roles: ["program_coordinator"],
    programmeRoles: [{ role: "program_coordinator", programmeId: "dse" }],
    ...overrides,
  };
}

describe("public programme information management scope", () => {
  test("allows a programme coordinator assigned to the programme", () => {
    expect(hasPublicInfoManagementScope(user(), "dse")).toBe(true);
  });

  test("allows a global admin for every programme", () => {
    expect(
      hasPublicInfoManagementScope(
        user({
          roles: ["admin"],
          programmeRoles: [{ role: "admin", programmeId: null }],
        }),
        "another-programme",
      ),
    ).toBe(true);
  });

  test("rejects a coordinator assigned to another programme", () => {
    expect(
      hasPublicInfoManagementScope(
        user({
          programmeRoles: [{ role: "program_coordinator", programmeId: "other" }],
        }),
        "dse",
      ),
    ).toBe(false);
  });

  test("rejects lecturer and programme secretary roles", () => {
    expect(
      hasPublicInfoManagementScope(
        user({
          roles: ["lecturer", "program_secretary"],
          programmeRoles: [
            { role: "lecturer", programmeId: "dse" },
            { role: "program_secretary", programmeId: "dse" },
          ],
        }),
        "dse",
      ),
    ).toBe(false);
  });
});
