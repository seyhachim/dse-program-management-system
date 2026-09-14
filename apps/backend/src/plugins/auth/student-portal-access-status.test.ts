import { describe, expect, test } from "bun:test";
import { classifyStudentPortalAccess } from "./student-portal-access-status.ts";

const ACTIVE = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "Active",
  email: "student@dse.dev",
  userId: "22222222-2222-4222-8222-222222222222",
};

const LINKED_USER = {
  email: "student@dse.dev",
  authId: "supabase-user-id",
  hasStudentRole: true,
};

describe("classifyStudentPortalAccess", () => {
  test("classifies inactive, missing-email, and never-invited students locally", () => {
    expect(
      classifyStudentPortalAccess({
        student: { ...ACTIVE, status: "Inactive" },
      }),
    ).toBe("inactive-student");
    expect(
      classifyStudentPortalAccess({
        student: { ...ACTIVE, email: null },
      }),
    ).toBe("no-email");
    expect(
      classifyStudentPortalAccess({
        student: { ...ACTIVE, userId: null },
      }),
    ).toBe("not-invited");
  });

  test("fails closed for broken local Student/User linkage", () => {
    expect(classifyStudentPortalAccess({ student: ACTIVE, linkedUser: null })).toBe(
      "needs-attention",
    );
    expect(
      classifyStudentPortalAccess({
        student: ACTIVE,
        linkedUser: { ...LINKED_USER, hasStudentRole: false },
      }),
    ).toBe("needs-attention");
    expect(
      classifyStudentPortalAccess({
        student: ACTIVE,
        linkedUser: { ...LINKED_USER, authId: null },
      }),
    ).toBe("needs-attention");
    expect(
      classifyStudentPortalAccess({
        student: ACTIVE,
        linkedUser: { ...LINKED_USER, email: "different@dse.dev" },
      }),
    ).toBe("needs-attention");
  });

  test("does not guess linked status when Supabase lookup is unavailable", () => {
    expect(
      classifyStudentPortalAccess({ student: ACTIVE, linkedUser: LINKED_USER }),
    ).toBe("status-unavailable");
    expect(
      classifyStudentPortalAccess({
        student: ACTIVE,
        linkedUser: LINKED_USER,
        authLookup: { kind: "error" },
      }),
    ).toBe("status-unavailable");
  });

  test("marks missing or email-mismatched auth identities for attention", () => {
    expect(
      classifyStudentPortalAccess({
        student: ACTIVE,
        linkedUser: LINKED_USER,
        authLookup: { kind: "missing" },
      }),
    ).toBe("needs-attention");
    expect(
      classifyStudentPortalAccess({
        student: ACTIVE,
        linkedUser: LINKED_USER,
        authLookup: {
          kind: "ok",
          user: { email: "different@dse.dev", invited_at: "2026-09-14T00:00:00Z" },
        },
      }),
    ).toBe("needs-attention");
  });

  test("uses the canonical pending invitation definition", () => {
    expect(
      classifyStudentPortalAccess({
        student: ACTIVE,
        linkedUser: LINKED_USER,
        authLookup: {
          kind: "ok",
          user: {
            email: "student@dse.dev",
            invited_at: "2026-09-14T00:00:00Z",
            email_confirmed_at: null,
            confirmed_at: null,
            last_sign_in_at: null,
          },
        },
      }),
    ).toBe("invitation-pending");
  });

  test("treats confirmed, signed-in, or other non-pending identities as an existing active account", () => {
    for (const user of [
      {
        email: "student@dse.dev",
        invited_at: "2026-09-14T00:00:00Z",
        email_confirmed_at: "2026-09-14T00:01:00Z",
      },
      {
        email: "student@dse.dev",
        invited_at: "2026-09-14T00:00:00Z",
        last_sign_in_at: "2026-09-14T00:02:00Z",
      },
      { email: "student@dse.dev", invited_at: null },
    ]) {
      expect(
        classifyStudentPortalAccess({
          student: ACTIVE,
          linkedUser: LINKED_USER,
          authLookup: { kind: "ok", user },
        }),
      ).toBe("active-account");
    }
  });
});
