import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const guardSource = readFileSync(new URL("./app/(shell)/auth-guard.tsx", import.meta.url), "utf8");
const changePasswordSource = readFileSync(new URL("./app/change-password/page.tsx", import.meta.url), "utf8");
const lecturersSource = readFileSync(new URL("./app/(shell)/lecturers/lecturers-client.tsx", import.meta.url), "utf8");

describe("forced password recovery UI wiring", () => {
  test("normal shell access redirects a flagged account to change-password", () => {
    expect(guardSource).toContain("me?.mustChangePassword");
    expect(guardSource).toContain('router.replace("/change-password")');
    expect(guardSource).toContain("if (!sessionReady || meLoading || me?.mustChangePassword)");
    expect(guardSource).toContain("return <ShellLoadingFrame />");
  });

  test("change-password route uses the backend contract and clears cached me state", () => {
    expect(changePasswordSource).toContain("ChangePasswordInput.safeParse");
    expect(changePasswordSource).toContain("authApi.changePassword(parsed.data)");
    expect(changePasswordSource).toContain("invalidateMe()");
    expect(changePasswordSource).toContain('router.replace("/dashboard")');
  });

  test("active lecturer rows expose admin recovery rather than resend invitation", () => {
    expect(lecturersSource).toContain("Set temporary password");
    expect(lecturersSource).toContain("authApi.setTemporaryPassword(lecturer.id)");
    expect(lecturersSource).toContain("This password is shown only in this browser state");
    expect(lecturersSource).not.toContain("Resend invitation");
  });
});
