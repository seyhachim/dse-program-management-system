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

export function reconcilePolicyDraftWithPersisted(
  draft: PolicySection,
  previousPersisted: PolicySection,
  nextPersisted: PolicySection,
): PolicySection {
  const nextDraft = { ...draft };

  for (const key of Object.keys(nextPersisted) as (keyof PolicySection)[]) {
    if (draft[key] === previousPersisted[key]) {
      nextDraft[key] = nextPersisted[key];
    }
  }

  return nextDraft;
}
