import type { NextFunction, Request, Response } from "express";
import type { Role } from "../../core/auth/token.ts";

/**
 * Programme-approved teaching/assessment vocabulary is an academic-governance
 * concern. Only system admins and the programme academic owner (currently the
 * program_coordinator role, i.e. Head of Programme) may manage it.
 *
 * Lecturers, programme secretaries, QA reviewers and students may still read
 * vocabulary where their normal permissions allow it, but they cannot add,
 * rename, archive, restore, regroup or otherwise mutate the catalogue.
 */
export const METHOD_VOCABULARY_MANAGER_ROLES: readonly Role[] = [
  "admin",
  "program_coordinator",
];

export function canManageMethodVocabulary(roles: Role[]): boolean {
  return METHOD_VOCABULARY_MANAGER_ROLES.some((role) => roles.includes(role));
}

export function requireMethodVocabularyManager(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (!canManageMethodVocabulary(user.roles)) {
    res.status(403).json({
      error: "Only Admin or Head of Programme can manage approved teaching vocabulary",
    });
    return;
  }

  next();
}
