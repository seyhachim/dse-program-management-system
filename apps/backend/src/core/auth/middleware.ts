import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.ts";
import {
  getAuthMode,
  verifySupabaseToken,
  verifyToken,
  type AuthUser,
  type Role,
} from "./token.ts";

/** Augment Express Request with the authenticated user. */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Verifies the Bearer token and attaches `req.user`. This is the only place the
 * app reads the raw token. In `dev` mode it verifies a local HS256 token whole.
 * In `supabase` mode it verifies the Supabase JWT for identity only, then
 * resolves the caller to an app `User` row (by authId, falling back to email and
 * backfilling authId on first login) — the `UserRoleAssignment` join table
 * (issue #77 phase B) is the authorization source of truth. A valid Supabase
 * login with no provisioned `User` is 403.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  try {
    req.user = getAuthMode() === "supabase" ? await resolveSupabaseUser(token) : verifyToken(token);
    next();
  } catch (err) {
    if (err instanceof UnprovisionedAccountError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

class UnprovisionedAccountError extends Error {}

async function resolveSupabaseUser(token: string): Promise<AuthUser> {
  const { authId, email } = await verifySupabaseToken(token);

  const roleAssignmentsInclude = { roleAssignments: { include: { role: true } } } as const;

  // Prefer the stable auth uid; fall back to email so pre-existing seeded
  // profiles (created before they ever logged in) link on first login.
  let user = await prisma.user.findUnique({ where: { authId }, include: roleAssignmentsInclude });
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email }, include: roleAssignmentsInclude });
    if (byEmail) {
      user = byEmail.authId
        ? byEmail
        : await prisma.user.update({
            where: { id: byEmail.id },
            data: { authId },
            include: roleAssignmentsInclude,
          });
    }
  }

  if (!user) {
    throw new UnprovisionedAccountError("No account provisioned for this login");
  }

  // UserRoleAssignment is the authorization source of truth (issue #77).
  const roles = user.roleAssignments.map((a) => a.role.slug as Role);
  // programmeId is already a scalar column on the loaded join row (issue #147).
  const programmeRoles = user.roleAssignments.map((a) => ({
    role: a.role.slug as Role,
    programmeId: a.programmeId,
  }));
  return { id: user.id, email: user.email, roles, programmeRoles };
}
