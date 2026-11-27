import { describe, expect, test } from "bun:test";
import { codeDigest } from "./student-registration-email.ts";

describe("registration email code digest", () => {
  test("binds challenge, email, code and server secret", () => {
    const args = ["test-secret-do-not-use-in-production", "challenge-1", "student@rupp.edu.kh", "000123"] as const;
    const digest = codeDigest(...args);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(codeDigest(...args)).toBe(digest);
    expect(codeDigest(args[0],"challenge-2",args[2],args[3])).not.toBe(digest);
    expect(codeDigest(args[0],args[1],"other@rupp.edu.kh",args[3])).not.toBe(digest);
    expect(codeDigest(args[0],args[1],args[2],"000124")).not.toBe(digest);
    expect(codeDigest("different-secret",args[1],args[2],args[3])).not.toBe(digest);
  });
});
