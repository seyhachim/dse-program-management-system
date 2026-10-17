import { describe, expect, test } from "bun:test";
import { AccountLinkingError } from "./account-linking.ts";
import { assertApprovedGoogleIdentity, tokenHasGoogleIdentity } from "./google-identity-approval.ts";

const uid = "72c10455-f821-4a64-9df3-111111111111";
const googleId = "cf4a8a52-3191-4fa3-87be-222222222222";
const identities = [
  { id: "8b1c6f9c-3e3b-45fe-99a8-333333333333", provider: "email" },
  { id: googleId, provider: "google" },
];
const approved = JSON.stringify({ [uid]: googleId });

function denies(identitiesToTest: typeof identities | undefined, config: string | undefined) {
  expect(() => assertApprovedGoogleIdentity(uid, identitiesToTest, config)).toThrow(AccountLinkingError);
}

describe("server-controlled exact Google identity approval", () => {
  test("allows only the independently approved UID and provider identity pair", () => {
    expect(() => assertApprovedGoogleIdentity(uid, identities, approved)).not.toThrow();
    expect(() => assertApprovedGoogleIdentity("other-uid", identities, approved)).toThrow(AccountLinkingError);
  });

  test("rejects Supabase auto-link by verified matching email without approval", () => {
    denies(identities, undefined);
    denies(identities, "{}");
    denies(identities, JSON.stringify({ [uid]: "other-google-identity" }));
  });

  test("rejects duplicate, missing or misclassified provider identities", () => {
    denies(undefined, approved);
    denies([], approved);
    denies([{ id: googleId, provider: "email" }], approved);
    denies([...identities, { id: "another-google-id", provider: "google" }], approved);
    denies([{ id: "", provider: "google" }], approved);
  });

  test("malformed approval configuration fails closed", () => {
    for (const config of ["", "not-json", "null", "[]", JSON.stringify({ [uid]: 42 })]) {
      denies(identities, config);
    }
  });

  test("verified JWT Google provider metadata triggers authoritative identity review", () => {
    expect(tokenHasGoogleIdentity({ provider: "google" })).toBe(true);
    expect(tokenHasGoogleIdentity({ provider: "email", providers: ["email", "google"] })).toBe(true);
    expect(tokenHasGoogleIdentity({ provider: "email", providers: ["email"] })).toBe(false);
    expect(tokenHasGoogleIdentity(null)).toBe(false);
  });
});
