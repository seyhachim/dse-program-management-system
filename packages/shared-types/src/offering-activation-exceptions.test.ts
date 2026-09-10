import { describe, expect, test } from "bun:test";
import {
  RequestOfferingActivationExceptionInputSchema,
  ReviewOfferingActivationExceptionInputSchema,
  RevokeOfferingActivationExceptionInputSchema,
} from "./offering-activation-exceptions.ts";

describe("Offering activation exception contracts", () => {
  test("requires an explicit reason and date-only documentation deadline", () => {
    expect(
      RequestOfferingActivationExceptionInputSchema.safeParse({
        reason: "Teaching starts before the CourseSpec approval is complete.",
        documentationDueDate: "2026-10-01",
      }).success,
    ).toBe(true);

    expect(
      RequestOfferingActivationExceptionInputSchema.safeParse({
        reason: "Too short",
        documentationDueDate: "2026-10-01",
      }).success,
    ).toBe(false);

    expect(
      RequestOfferingActivationExceptionInputSchema.safeParse({
        reason: "Teaching starts before the CourseSpec approval is complete.",
        documentationDueDate: "10/01/2026",
      }).success,
    ).toBe(false);
  });

  test("constrains review decisions and revocation evidence", () => {
    expect(
      ReviewOfferingActivationExceptionInputSchema.safeParse({
        decision: "Approve",
        note: "Approved for current-semester continuity.",
      }).success,
    ).toBe(true);
    expect(
      ReviewOfferingActivationExceptionInputSchema.safeParse({
        decision: "Override",
      }).success,
    ).toBe(false);
    expect(
      RevokeOfferingActivationExceptionInputSchema.safeParse({ reason: "No" }).success,
    ).toBe(false);
  });
});
