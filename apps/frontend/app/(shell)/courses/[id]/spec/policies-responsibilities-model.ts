import type { PolicySection } from "@dse-pms/shared-types";

export const POLICIES_RESPONSIBILITIES_TAB = "policy" as const;
export const SPECIFICATION_DATE_TAB = "reviewSubmit" as const;

/**
 * Normalize legacy/section-level Course Specification targets to the current
 * combined tabs. Student Responsibility lives inside Policies & Responsibilities,
 * while issue #481 moved Specification Date into Review & Submit and removed the
 * standalone Date tab.
 */
export function normalizePoliciesResponsibilitiesTab(
  requested: string | null,
): string | null {
  if (requested === "responsibility") return POLICIES_RESPONSIBILITIES_TAB;
  if (requested === "date") return SPECIFICATION_DATE_TAB;
  return requested;
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
