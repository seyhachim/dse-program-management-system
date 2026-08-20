export const POLICIES_RESPONSIBILITIES_TAB = "policy" as const;

export function normalizePoliciesResponsibilitiesTab(
  requested: string | null,
): string | null {
  return requested === "responsibility"
    ? POLICIES_RESPONSIBILITIES_TAB
    : requested;
}
