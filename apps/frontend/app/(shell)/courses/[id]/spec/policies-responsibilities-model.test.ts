import { describe, expect, test } from "bun:test";
import {
  POLICIES_RESPONSIBILITIES_TAB,
  normalizePoliciesResponsibilitiesTab,
} from "./policies-responsibilities-model";


describe("Policies & Responsibilities Course Spec tab", () => {
  test("uses policy as the canonical combined tab id", () => {
    expect(POLICIES_RESPONSIBILITIES_TAB).toBe("policy");
  });

  test("redirects legacy responsibility deep links to the combined tab", () => {
    expect(normalizePoliciesResponsibilitiesTab("responsibility")).toBe("policy");
  });

  test("keeps existing policy deep links stable", () => {
    expect(normalizePoliciesResponsibilitiesTab("policy")).toBe("policy");
  });

  test("does not rewrite unrelated Course Spec tabs", () => {
    expect(normalizePoliciesResponsibilitiesTab("clos")).toBe("clos");
    expect(normalizePoliciesResponsibilitiesTab(null)).toBeNull();
  });
});
