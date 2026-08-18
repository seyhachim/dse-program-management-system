import type { CourseSpecVersionHistoryItem } from "@dse-pms/shared-types";

export type CourseSpecGovernanceActionDecision = {
  isGovernanceUser: boolean;
  canCreateRevision: boolean;
  canReaffirm: boolean;
};

export function courseSpecGovernanceActionDecision(
  roles: readonly string[] | undefined,
  current: CourseSpecVersionHistoryItem | null,
): CourseSpecGovernanceActionDecision {
  const isGovernanceUser =
    roles?.some((role) => role === "admin" || role === "program_coordinator") ?? false;
  const currentApproved = Boolean(current?.isCurrent && current.reviewStatus === "Approved");

  return {
    isGovernanceUser,
    canCreateRevision: isGovernanceUser && currentApproved,
    canReaffirm: isGovernanceUser && currentApproved,
  };
}
