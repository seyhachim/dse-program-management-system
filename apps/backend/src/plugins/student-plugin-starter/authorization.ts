import type { AuthUser } from "../../core/auth/token.ts";
import { hasAnyRoleInProgramme } from "../../core/auth/token.ts";

/**
 * The role/permission gate in router.ts and this exact programme-scope check
 * must both succeed. Never rely on frontend navigation to authorize access.
 */
export function canReadStudentPluginStarter(user: AuthUser, programmeId: string): boolean {
  if (!programmeId.trim()) return false;
  return hasAnyRoleInProgramme(
    user,
    ["admin", "program_coordinator", "lecturer", "student"],
    programmeId,
  );
}
