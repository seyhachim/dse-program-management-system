import type { PolicySection } from "@dse-pms/shared-types";

export const POLICIES_RESPONSIBILITIES_TAB = "policy" as const;

export function normalizePoliciesResponsibilitiesTab(
  requested: string | null,
): string | null {
  return requested === "responsibility"
    ? POLICIES_RESPONSIBILITIES_TAB
    : requested;
}

export function mergePolicyFieldForSave(
  persisted: PolicySection,
  key: keyof PolicySection,
  draftValue: string,
): PolicySection {
  return {
    ...persisted,
    [key]: draftValue.trim(),
  };
}
