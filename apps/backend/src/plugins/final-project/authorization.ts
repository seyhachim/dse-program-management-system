import type { AuthUser } from "../../core/auth/token.ts";
import { hasAnyRoleInProgramme, hasGlobalRole, hasRoleInProgramme } from "../../core/auth/token.ts";

const STAFF_DISCOVERY_ROLES = [
  "lecturer",
  "program_coordinator",
  "program_secretary",
] as const;

/**
 * Student discovery is a Year IV academic entitlement, not a coarse role grant.
 * Staff keep the discovery access they had before #1072; students additionally
 * need an authoritative eligible Final Project enrolment.
 */
export function canReadSupervisorDiscovery(
  user: AuthUser,
  programmeId: string,
  studentEligible = false,
): boolean {
  if (hasGlobalRole(user, "admin")) return true;
  if (hasAnyRoleInProgramme(user, [...STAFF_DISCOVERY_ROLES], programmeId)) return true;
  return studentEligible && hasRoleInProgramme(user, "student", programmeId);
}

export function canCheckStudentFinalProjectEligibility(user: AuthUser, programmeId: string): boolean {
  return hasRoleInProgramme(user, "student", programmeId);
}

export function canEditOwnSupervisorProfile(user: AuthUser, programmeId: string, lecturerId: string): boolean {
  return user.id === lecturerId && hasRoleInProgramme(user, "lecturer", programmeId);
}

export function canManageSupervisorOverview(user: AuthUser, programmeId: string): boolean {
  return hasGlobalRole(user, "admin") || hasRoleInProgramme(user, "program_coordinator", programmeId);
}
