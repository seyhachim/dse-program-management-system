import type { AuthUser } from "../../core/auth/token.ts";
import { hasAnyRoleInProgramme } from "../../core/auth/token.ts";

const COURSE_SPEC_REVISION_GOVERNANCE_ROLES = [
  "admin",
  "program_coordinator",
] as const;

export function canCreateCourseSpecRevision(
  user: AuthUser,
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(
    user,
    [...COURSE_SPEC_REVISION_GOVERNANCE_ROLES],
    programmeId,
  );
}
