import { describe, expect, test } from "bun:test";
import {
  AssignClassResponsibilityInput,
  ClassResponsibilityRoleSchema,
  RevokeClassResponsibilityInput,
} from "./class-responsibilities.ts";

describe("class responsibility contracts", () => {
  test("accepts only canonical monitor roles", () => {
    expect(ClassResponsibilityRoleSchema.parse("ClassMonitor")).toBe("ClassMonitor");
    expect(ClassResponsibilityRoleSchema.parse("SubClassMonitor")).toBe("SubClassMonitor");
    expect(ClassResponsibilityRoleSchema.safeParse("class_monitor").success).toBe(false);
  });

  test("requires a UUID student id when assigning", () => {
    expect(
      AssignClassResponsibilityInput.safeParse({
        studentId: "11111111-1111-4111-8111-111111111111",
        role: "ClassMonitor",
      }).success,
    ).toBe(true);
    expect(AssignClassResponsibilityInput.safeParse({ studentId: "student-1", role: "ClassMonitor" }).success).toBe(false);
  });

  test("requires a meaningful revocation reason", () => {
    expect(RevokeClassResponsibilityInput.safeParse({ reason: "New monitor appointed" }).success).toBe(true);
    expect(RevokeClassResponsibilityInput.safeParse({ reason: "   " }).success).toBe(false);
  });
});
