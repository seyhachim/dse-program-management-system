import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  AccountLinkingError,
  assertEmailOnlySupabaseIdentity,
  assertLegacyEmailClaim,
  type ConfirmedAuthUser,
} from "./account-linking.ts";

const identity = { authId: "auth-student-1", email: "student@rupp.edu.kh" };
const verified: ConfirmedAuthUser = {
  id: identity.authId,
  email: identity.email,
  email_confirmed_at: "2026-09-16T00:00:00Z",
  identities: [{ provider: "email" }],
};

// These are deliberately synthetic identities; do not use a real student in negative-path tests.
describe("PMS Supabase account-linking boundary", () => {
  test("allows a confirmed, current single email identity and case-insensitive email", () => {
    expect(() => assertEmailOnlySupabaseIdentity(identity, verified)).not.toThrow();
    expect(() => assertLegacyEmailClaim(identity, null, verified)).not.toThrow();
    expect(() => assertLegacyEmailClaim({ ...identity, email: identity.email.toUpperCase() }, null, verified)).not.toThrow();
  });

  test("a different UID must never claim an already-bound PMS User, regardless of matching email", () => {
    expect(() => assertLegacyEmailClaim(identity, "another-auth-uid", verified)).toThrow(AccountLinkingError);
  });

  test("rejects missing, unconfirmed, mismatched, and unavailable current Auth identity", () => {
    for (const candidate of [
      null,
      { ...verified, id: "different-auth-uid" },
      { ...verified, email: "other@rupp.edu.kh" },
      { ...verified, email_confirmed_at: null },
      { ...verified, identities: null },
      { ...verified, identities: [] },
    ]) {
      expect(() => assertEmailOnlySupabaseIdentity(identity, candidate)).toThrow(AccountLinkingError);
    }
  });

  test("denies a current Google/GitHub identity, including after upstream auto-linking", () => {
    for (const identities of [
      [{ provider: "github" }],
      [{ provider: "google" }],
      [{ provider: "email" }, { provider: "github" }],
      [{ provider: "email" }, { provider: "google" }],
      [{ provider: "email" }, { provider: "email" }],
    ]) {
      expect(() => assertEmailOnlySupabaseIdentity(identity, { ...verified, identities })).toThrow(AccountLinkingError);
    }
  });

  test("middleware verifies live Admin identities before resolving a PMS UID or email", () => {
    const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
    const verifiedAt = source.indexOf("assertEmailOnlySupabaseIdentity({ authId, email }, verifiedAuthUser)");
    const resolvedAt = source.indexOf("prisma.user.findUnique({ where: { authId }");
    expect(verifiedAt).toBeGreaterThan(0);
    expect(resolvedAt).toBeGreaterThan(verifiedAt);
    expect(source).toContain("auth.admin.getUserById(authId)");
    expect(source).toContain("if (error) throw error");
    expect(source).toContain("throw new AccountLinkingError(\"Supabase identity verification failed\")");
    expect(source).toContain("where: { id: byEmail.id, authId: null }");
    expect(source).toContain("if (claimed.count !== 1) throw new AccountLinkingError");
    expect(source).not.toContain("user = byEmail.authId ? byEmail");
  });
});
