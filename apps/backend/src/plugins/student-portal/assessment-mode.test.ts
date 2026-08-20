import { describe, expect, test } from "bun:test";
import { portalAssessmentMode } from "./service.ts";

describe("student portal assessment mode mapping", () => {
  test("preserves Individual, Group, and Group + Individual modes", () => {
    expect(portalAssessmentMode("Individual")).toBe("individual");
    expect(portalAssessmentMode("Group")).toBe("group");
    expect(portalAssessmentMode("GroupIndividual")).toBe("group_individual");
  });
});
