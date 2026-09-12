import { describe, expect, test } from "bun:test";
import type { AuthUser, Role } from "../../core/auth/token.ts";
import {
  canRequestOfferingActivationException,
  canReviewOfferingActivationException,
} from "./activation-exception-router.ts";

function user(role: Role, programmeId: string | null): AuthUser {
  return {
    id: `${role}-user`,
    email: `${role}@example.invalid`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("Offering activation exception programme scope", () => {
  test("programme secretary may request but cannot approve", () => {
    const secretary = user("program_secretary", "dse");
    expect(canRequestOfferingActivationException(secretary, "dse")).toBe(true);
    expect(canReviewOfferingActivationException(secretary, "dse")).toBe(false);
  });

  test("programme coordinator can review only inside the assigned programme", () => {
    const coordinator = user("program_coordinator", "dse");
    expect(canReviewOfferingActivationException(coordinator, "dse")).toBe(true);
    expect(canReviewOfferingActivationException(coordinator, "other-programme")).toBe(false);
  });

  test("global admin can request and review across programmes", () => {
    const admin = user("admin", null);
    expect(canRequestOfferingActivationException(admin, "dse")).toBe(true);
    expect(canReviewOfferingActivationException(admin, "other-programme")).toBe(true);
  });

  test("lecturer and QA reviewer are not activation-exception approvers", () => {
    expect(canReviewOfferingActivationException(user("lecturer", "dse"), "dse")).toBe(false);
    expect(canReviewOfferingActivationException(user("qa_reviewer", "dse"), "dse")).toBe(false);
  });
});
