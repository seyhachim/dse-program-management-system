import type { AuthUser } from "../../core/auth/token.ts";
import { hasAnyRoleInProgramme, hasGlobalRole, hasRoleInProgramme } from "../../core/auth/token.ts";

const DISCOVERY_ROLES = [
  "student",
  "lecturer",
  "program_coordinator",
  "program_secretary",
  "admin",
] as const;

export function canReadSupervisorDiscovery(user: AuthUser, programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, [...DISCOVERY_ROLES], programmeId);
}

export function canEditOwnSupervisorProfile(user: AuthUser, programmeId: string, lecturerId: string): boolean {
  return user.id === lecturerId && hasRoleInProgramme(user, "lecturer", programmeId);
}

export function canManageSupervisorOverview(user: AuthUser, programmeId: string): boolean {
  return hasGlobalRole(user, "admin") || hasRoleInProgramme(user, "program_coordinator", programmeId);
}
