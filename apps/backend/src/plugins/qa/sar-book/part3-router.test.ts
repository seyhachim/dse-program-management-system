import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../../core/auth/token.ts";
import { canWriteQaSarBookPart3 } from "./part3-router.ts";

function user(role: AuthUser["roles"][number], programmeId: string | null): AuthUser {
  return {
    id: `user-${role}-${programmeId ?? "global"}`,
    email: `${role}@example.com`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("SAR book Part 3 authorization", () => {
  test("allows programme governance and QA reviewer judgement", () => {
    expect(canWriteQaSarBookPart3(user("admin", null), "dse")).toBe(true);
    expect(canWriteQaSarBookPart3(user("program_coordinator", "dse"), "dse")).toBe(true);
    expect(canWriteQaSarBookPart3(user("qa_reviewer", "dse"), "dse")).toBe(true);
  });

  test("fails closed for contributors and cross-programme roles", () => {
    expect(canWriteQaSarBookPart3(user("qa_contributor", "dse"), "dse")).toBe(false);
    expect(canWriteQaSarBookPart3(user("qa_reviewer", "computer-science"), "dse")).toBe(false);
    expect(canWriteQaSarBookPart3(user("program_coordinator", "computer-science"), "dse")).toBe(false);
  });
});
