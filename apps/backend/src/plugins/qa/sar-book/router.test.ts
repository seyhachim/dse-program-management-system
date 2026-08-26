import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../../core/auth/token.ts";
import {
  canManageSarBook,
  canReadSarBook,
  canWriteSarBookNarrative,
} from "./router.ts";

function user(
  programmeId: string | null,
  role: AuthUser["roles"][number],
  id = `user-${role}`,
): AuthUser {
  return {
    id,
    email: `${role}@example.com`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("SAR book programme scope", () => {
  test("allows programme QA contributors, reviewers, coordinators and global admins to read", () => {
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

  test("limits assignment management to programme leadership", () => {
    expect(canManageSarBook(user(null, "admin"), "dse")).toBe(true);
    expect(canManageSarBook(user("dse", "program_coordinator"), "dse")).toBe(true);
    expect(canManageSarBook(user("dse", "qa_contributor"), "dse")).toBe(false);
    expect(canManageSarBook(user("computer-science", "program_coordinator"), "dse")).toBe(false);
  });

  test("allows programme leadership and the exact assigned QA contributor to write", () => {
    expect(canWriteSarBookNarrative(user(null, "admin"), "dse", null)).toBe(true);
    expect(
      canWriteSarBookNarrative(user("dse", "program_coordinator"), "dse", null),
    ).toBe(true);

    const assigned = user("dse", "qa_contributor", "contributor-a");
    expect(canWriteSarBookNarrative(assigned, "dse", "contributor-a")).toBe(true);
    expect(canWriteSarBookNarrative(assigned, "dse", "contributor-b")).toBe(false);
    expect(canWriteSarBookNarrative(assigned, "dse", null)).toBe(false);
  });

  test("keeps reviewers and cross-programme contributors read-only", () => {
    expect(
      canWriteSarBookNarrative(user("dse", "qa_reviewer", "reviewer"), "dse", "reviewer"),
    ).toBe(false);
    expect(
      canWriteSarBookNarrative(
        user("computer-science", "qa_contributor", "contributor-a"),
        "dse",
        "contributor-a",
      ),
    ).toBe(false);
  });
});
