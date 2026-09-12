import { describe, expect, test } from "bun:test";
import {
  AssignResourceResponsibilityInput,
  CreateResourceTypeInput,
  HandoverResourceResponsibilityInput,
} from "@dse-pms/shared-types";

describe("resources shared contracts", () => {
  test("accepts quantity and serialized resource types", () => {
    expect(
      CreateResourceTypeInput.parse({
        name: "Student Table",
        category: "Furniture",
        unit: "item",
        trackingMode: "QUANTITY",
      }).trackingMode,
    ).toBe("QUANTITY");
    expect(
      CreateResourceTypeInput.parse({
        name: "GPU Workstation",
        category: "Computing",
        unit: "unit",
        trackingMode: "SERIALIZED",
      }).trackingMode,
    ).toBe("SERIALIZED");
  });

  test("Resource Coordinator is programme-scoped", () => {
    const result = AssignResourceResponsibilityInput.safeParse({
      userId: crypto.randomUUID(),
      responsibility: "RESOURCE_COORDINATOR",
      locationId: crypto.randomUUID(),
      effectiveFrom: "2026-09-01",
    });
    expect(result.success).toBe(false);
  });

  test("Lab Custodian requires a location", () => {
    const result = AssignResourceResponsibilityInput.safeParse({
      userId: crypto.randomUUID(),
      responsibility: "LAB_CUSTODIAN",
      effectiveFrom: "2026-09-01",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid responsibility date ranges and handover dates", () => {
    expect(
      AssignResourceResponsibilityInput.safeParse({
        userId: crypto.randomUUID(),
        responsibility: "RESOURCE_COORDINATOR",
        effectiveFrom: "2026-09-02",
        effectiveTo: "2026-09-01",
      }).success,
    ).toBe(false);
    expect(
      HandoverResourceResponsibilityInput.safeParse({
        incomingUserId: crypto.randomUUID(),
        effectiveDate: "September 1",
        reason: "Staff handover",
      }).success,
    ).toBe(false);
  });
});
