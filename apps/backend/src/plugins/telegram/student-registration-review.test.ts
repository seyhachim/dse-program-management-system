import { describe, expect, test } from "bun:test";
import { TelegramRegistrationReviewSchema } from "@dse-pms/shared-types";
import type { AuthUser, Role } from "../../core/auth/token.ts";
import { canReviewRegistration } from "./student-registration-review.ts";

function user(role: Role, programmeId: string | null): AuthUser {
  return { id: "test-user", email: "test@example.invalid", roles: [role], programmeRoles: [{ role, programmeId }] };
}
describe("registration staff review boundary", () => {
  test("only global admin or DSE-scoped manager may review DSE registrations", () => {
    expect(canReviewRegistration(user("admin", null))).toBe(true);
    expect(canReviewRegistration(user("program_coordinator", "dse"))).toBe(true);
    for (const actor of [user("program_coordinator", "other"), user("admin", "other"), user("student", "dse"), user("lecturer", "dse"), user("program_secretary", "dse")]) {
      expect(canReviewRegistration(actor)).toBe(false);
    }
  });
  test("requires explicit confirmation, roster ID and review reason", () => {
    const valid = { decision: "APPROVE", studentId: "roster-id", identityConfirmed: true, reason: "In-person identity verification" };
    expect(TelegramRegistrationReviewSchema.safeParse(valid).success).toBe(true);
    for (const invalid of [{ ...valid, identityConfirmed: false }, { ...valid, studentId: "" }, { ...valid, reason: "ok" }, { ...valid, telegramUserId: "123" }, { ...valid, role: "admin" }]) {
      expect(TelegramRegistrationReviewSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
