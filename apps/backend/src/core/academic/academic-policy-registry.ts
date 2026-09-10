import { FDY_2025_YEAR1_POLICY } from "./year1-fdy-policy.ts";

export type AcademicPolicyRegistryEntry = typeof FDY_2025_YEAR1_POLICY;

/**
 * Versioned academic-policy registry for machine-readable university rules.
 *
 * This is deliberately separate from ProgramPolicy, which is the DSE programme's
 * free-text course-policy baseline, and from ProgrammeGradingScale, which is
 * programme-owned. FDY 2025 is a university policy and applies only to Year 1.
 *
 * Future university revisions are added as new entries rather than mutating the
 * historical FDY 2025 rule set. Persisted/audited policy administration can be
 * layered on top once policy-authoring workflow is introduced.
 */
export const ACADEMIC_POLICY_REGISTRY: readonly AcademicPolicyRegistryEntry[] = [
  FDY_2025_YEAR1_POLICY,
];

export function academicPolicyByCode(code: string): AcademicPolicyRegistryEntry | null {
  return ACADEMIC_POLICY_REGISTRY.find((policy) => policy.code === code) ?? null;
}

export function academicPoliciesForProgrammeYear(
  programmeYear: number | null | undefined,
): readonly AcademicPolicyRegistryEntry[] {
  if (programmeYear == null) return [];
  return ACADEMIC_POLICY_REGISTRY.filter(
    (policy) => policy.scope.programmeYear === programmeYear,
  );
}
