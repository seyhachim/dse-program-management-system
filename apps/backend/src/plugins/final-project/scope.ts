import type { AuthUser } from "../../core/auth/token.ts";
import { hasRoleInProgramme } from "../../core/auth/token.ts";

export function canReadFinalProject(user: AuthUser, programmeId: string): boolean {
  return (
    hasRoleInProgramme(user, "admin", programmeId) ||
    hasRoleInProgramme(user, "program_coordinator", programmeId) ||
    hasRoleInProgramme(user, "lecturer", programmeId) ||
    hasRoleInProgramme(user, "student", programmeId)
  );
}

export function canWriteOwnSupervisorProfile(user: AuthUser, programmeId: string): boolean {
  return hasRoleInProgramme(user, "lecturer", programmeId);
}

export function canManageFinalProject(user: AuthUser, programmeId: string): boolean {
  return (
    hasRoleInProgramme(user, "admin", programmeId) ||
    hasRoleInProgramme(user, "program_coordinator", programmeId)
  );
}
