import type { ProgrammeGradingScaleVersion, Role } from "@dse-pms/shared-types";

const MANAGER_ROLES: Role[] = ["admin", "program_coordinator"];

export function canManageGradingScales(roles: readonly Role[]): boolean {
  return roles.some((role) => MANAGER_ROLES.includes(role));
}

export function canEditGradingScaleVersion(
  roles: readonly Role[],
  version: ProgrammeGradingScaleVersion,
): boolean {
  return canManageGradingScales(roles) && version.status === "Draft" && !version.legacyImported;
}

export function canApproveGradingScaleVersion(
  roles: readonly Role[],
  version: ProgrammeGradingScaleVersion,
): boolean {
  return canManageGradingScales(roles) && version.status === "Draft";
}

export function canCreateGradingScaleRevision(
  roles: readonly Role[],
  version: ProgrammeGradingScaleVersion,
): boolean {
  return canManageGradingScales(roles) && version.status === "Approved";
}
