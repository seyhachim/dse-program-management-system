import { describe, expect, test } from "bun:test";
import { AccountLinkingError, assertLegacyEmailClaim } from "./account-linking.ts";

const identity = { authId: "auth-student-1", email: "student@rupp.edu.kh", provider: "email" };
const confirmed = {
  id: "auth-student-1",
  email: "student@rupp.edu.kh",
  email_confirmed_at: "2026-09-16T00:00:00Z",
};

describe("claiming a historical PMS account by email", () => {
  test("allows only a confirmed email-provider identity for an unbound account", () => {
    expect(() => assertLegacyEmailClaim(identity, null, confirmed)).not.toThrow();
    expect(() => assertLegacyEmailClaim({ ...identity, email: "STUDENT@RUPP.EDU.KH" }, null, confirmed)).not.toThrow();
  });

  test("denies a different Supabase UID even when the provider email matches", () => {
    expect(() => assertLegacyEmailClaim(identity, "existing-auth-id", confirmed)).toThrow(AccountLinkingError);
  });

  test("denies GitHub identity even with a matching confirmed email", () => {
    expect(() => assertLegacyEmailClaim({ ...identity, provider: "github" }, null, confirmed)).toThrow(AccountLinkingError);
    expect(() => assertLegacyEmailClaim({ ...identity, provider: null }, null, confirmed)).toThrow(AccountLinkingError);
  });

  test("denies an unconfirmed, missing, or different Supabase identity", () => {
    expect(() => assertLegacyEmailClaim(identity, null, null)).toThrow(AccountLinkingError);
    expect(() => assertLegacyEmailClaim(identity, null, { ...confirmed, email_confirmed_at: null })).toThrow(AccountLinkingError);
    expect(() => assertLegacyEmailClaim(identity, null, { ...confirmed, id: "attacker" })).toThrow(AccountLinkingError);
    expect(() => assertLegacyEmailClaim(identity, null, { ...confirmed, email: "other@rupp.edu.kh" })).toThrow(AccountLinkingError);
  });
});
