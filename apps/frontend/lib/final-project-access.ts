"use client";

import { useQuery } from "@tanstack/react-query";
import type { FinalProjectEligibilityView, Role } from "@dse-pms/shared-types";
import { api } from "./api";

/** Current PMS deployment is the DSE programme; keep this in one place until programme context is user-selectable. */
export const FINAL_PROJECT_PROGRAMME_ID = "dse";

const STAFF_DISCOVERY_ROLES = new Set<Role>([
  "admin",
  "program_coordinator",
  "program_secretary",
  "lecturer",
]);

/**
 * Multi-role staff retain their staff discovery entitlement. A student-only
 * caller must prove Year IV Final Project enrolment through the backend.
 */
export function requiresFinalProjectStudentEligibility(roles: Role[]): boolean {
  return roles.includes("student") && !roles.some((role) => STAFF_DISCOVERY_ROLES.has(role));
}

export function useFinalProjectStudentEligibility(
  userId: string | undefined,
  roles: Role[],
  programmeId = FINAL_PROJECT_PROGRAMME_ID,
): { eligible: boolean; loading: boolean; required: boolean } {
  const required = requiresFinalProjectStudentEligibility(roles);
  const query = useQuery({
    queryKey: ["final-project", "eligibility", userId, programmeId],
    queryFn: () => api.get<FinalProjectEligibilityView>(
      `/api/final-project/eligibility?programmeId=${encodeURIComponent(programmeId)}`,
    ),
    enabled: Boolean(userId && required),
    retry: false,
    staleTime: 60_000,
  });

  return {
    required,
    eligible: required ? query.data?.eligible === true : true,
    loading: required && query.isLoading,
  };
}
