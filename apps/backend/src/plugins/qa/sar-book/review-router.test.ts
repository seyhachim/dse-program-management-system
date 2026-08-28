import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../../core/auth/token.ts";
import { canReviewSarBook } from "./review-router.ts";

function user(
  programmeId: string | null,
  role: AuthUser["roles"][number],
): AuthUser {
  return {
    id: `user-${role}`,
    email: `${role}@example.com`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("SAR book reviewer programme scope", () => {
  test("allows only programme review/governance roles", () => {
    expect(canReviewSarBook(user(null, "admin"), "dse")).toBe(true);
    expect(canReviewSarBook(user("dse", "program_coordinator"), "dse")).toBe(true);
    expect(canReviewSarBook(user("dse", "qa_reviewer"), "dse")).toBe(true);
    expect(canReviewSarBook(user("dse", "qa_contributor"), "dse")).toBe(false);
  });

  test("fails closed across programmes", () => {
    expect(canReviewSarBook(user("computer-science", "qa_reviewer"), "dse")).toBe(false);
    expect(canReviewSarBook(user("computer-science", "program_coordinator"), "dse")).toBe(false);
  });
});
