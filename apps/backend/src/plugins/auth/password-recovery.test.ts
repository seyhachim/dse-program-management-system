import { describe, expect, it } from "bun:test";
import { ChangePasswordInput } from "@dse-pms/shared-types";
import { isPasswordRecoveryRoute } from "../../core/auth/middleware.ts";
import { createTemporaryPassword } from "./service.ts";

describe("temporary password recovery", () => {
  it("generates different strong passwords that satisfy the shared API policy", () => {
    const first = createTemporaryPassword();
    const second = createTemporaryPassword();

    expect(first).not.toBe(second);
    expect(ChangePasswordInput.safeParse({ password: first }).success).toBe(true);
    expect(ChangePasswordInput.safeParse({ password: second }).success).toBe(true);
    expect(first.length).toBeGreaterThanOrEqual(20);
  });

  it("rejects weak replacement passwords at the shared contract boundary", () => {
    expect(ChangePasswordInput.safeParse({ password: "short" }).success).toBe(false);
    expect(ChangePasswordInput.safeParse({ password: "alllowercase123!" }).success).toBe(false);
    expect(ChangePasswordInput.safeParse({ password: "ALLUPPERCASE123!" }).success).toBe(false);
    expect(ChangePasswordInput.safeParse({ password: "NoNumberSymbols!" }).success).toBe(false);
    expect(ChangePasswordInput.safeParse({ password: "NoSymbol12345Aa" }).success).toBe(false);
  });

  it("allows only me and self password change through the forced-change auth gate", () => {
    expect(isPasswordRecoveryRoute({ baseUrl: "/api/auth", path: "/me" })).toBe(true);
    expect(isPasswordRecoveryRoute({ baseUrl: "/api/auth", path: "/change-password" })).toBe(true);
    expect(isPasswordRecoveryRoute({ baseUrl: "/api/auth", path: "/accounts" })).toBe(false);
    expect(isPasswordRecoveryRoute({ baseUrl: "/api/lecturers", path: "/" })).toBe(false);
  });
});
