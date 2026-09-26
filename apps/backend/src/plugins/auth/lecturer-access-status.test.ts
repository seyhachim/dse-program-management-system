import { describe, expect, test } from "bun:test";
import { classifyLecturerAccess } from "./lecturer-access-status.ts";

const LECTURER = {
  email: "lecturer@dse.dev",
  authId: "supabase-user-id",
};

describe("classifyLecturerAccess", () => {
  test("shows no access when no Supabase identity is linked", () => {
    expect(
      classifyLecturerAccess({
        lecturer: { ...LECTURER, authId: null },
      }),
    ).toBe("no-access");
  });

  test("keeps linked state unavailable when provider lookup cannot be verified", () => {
    expect(classifyLecturerAccess({ lecturer: LECTURER })).toBe("status-unavailable");
    expect(
      classifyLecturerAccess({
        lecturer: LECTURER,
        authLookup: { kind: "error" },
      }),
    ).toBe("status-unavailable");
  });

  test("marks missing or email-mismatched identities for attention", () => {
    expect(
      classifyLecturerAccess({
        lecturer: LECTURER,
        authLookup: { kind: "missing" },
      }),
    ).toBe("needs-attention");
    expect(
      classifyLecturerAccess({
        lecturer: LECTURER,
        authLookup: {
          kind: "ok",
          user: { email: "different@dse.dev", invited_at: "2026-09-26T00:00:00Z" },
        },
      }),
    ).toBe("needs-attention");
  });

  test("uses the canonical pending invitation definition", () => {
    expect(
      classifyLecturerAccess({
        lecturer: LECTURER,
        authLookup: {
          kind: "ok",
          user: {
            email: "lecturer@dse.dev",
            invited_at: "2026-09-26T00:00:00Z",
            email_confirmed_at: null,
            confirmed_at: null,
            last_sign_in_at: null,
          },
        },
      }),
    ).toBe("invitation-pending");
  });

  test("treats confirmed, signed-in, or other non-pending linked identities as active", () => {
    for (const user of [
      {
        email: "lecturer@dse.dev",
        invited_at: "2026-09-26T00:00:00Z",
        email_confirmed_at: "2026-09-26T00:01:00Z",
      },
      {
        email: "lecturer@dse.dev",
        invited_at: "2026-09-26T00:00:00Z",
        last_sign_in_at: "2026-09-26T00:02:00Z",
      },
      { email: "lecturer@dse.dev", invited_at: null },
    ]) {
      expect(
        classifyLecturerAccess({
          lecturer: LECTURER,
          authLookup: { kind: "ok", user },
        }),
      ).toBe("active-account");
    }
  });
});
