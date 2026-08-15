import { expect, test } from "bun:test";
import type { AuthUser } from "../../core/auth/token.ts";
import { canAccessQaProgramme } from "./router.ts";

function user(programmeId: string | null, role: AuthUser["roles"][number]): AuthUser {
  return {
    id: "user-1",
    email: "qa@example.com",
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

test("QA scope accepts global admin and matching programme roles", () => {
  expect(canAccessQaProgramme(user(null, "admin"), "dse")).toBe(true);
  expect(canAccessQaProgramme(user("dse", "qa_reviewer"), "dse")).toBe(true);
  expect(canAccessQaProgramme(user("dse", "program_coordinator"), "dse")).toBe(true);
});

test("QA scope rejects another programme and non-QA roles", () => {
  expect(canAccessQaProgramme(user("computer-science", "qa_reviewer"), "dse")).toBe(false);
  expect(canAccessQaProgramme(user("dse", "lecturer"), "dse")).toBe(false);
  expect(canAccessQaProgramme(user("dse", "program_secretary"), "dse")).toBe(false);
});
