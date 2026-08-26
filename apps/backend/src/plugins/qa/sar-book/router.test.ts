import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../../core/auth/token.ts";
import { canReadSarBook } from "./router.ts";

function user(programmeId: string | null, role: AuthUser["roles"][number]): AuthUser {
  return {
    id: `user-${role}`,
    email: `${role}@example.com`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("SAR book programme scope", () => {
  test("allows programme QA contributors, reviewers, coordinators and global admins", () => {
    expect(canReadSarBook(user("dse", "qa_contributor"), "dse")).toBe(true);
    expect(canReadSarBook(user("dse", "qa_reviewer"), "dse")).toBe(true);
    expect(canReadSarBook(user("dse", "program_coordinator"), "dse")).toBe(true);
    expect(canReadSarBook(user(null, "admin"), "dse")).toBe(true);
  });

  test("fails closed for another programme and unrelated roles", () => {
    expect(canReadSarBook(user("computer-science", "qa_contributor"), "dse")).toBe(false);
    expect(canReadSarBook(user("dse", "lecturer"), "dse")).toBe(false);
    expect(canReadSarBook(user("dse", "student"), "dse")).toBe(false);
  });
});
