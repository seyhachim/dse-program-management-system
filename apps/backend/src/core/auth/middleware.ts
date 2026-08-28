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

class UnprovisionedAccountError extends Error {}

async function mustChangePassword(userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ mustChangePassword: boolean }>>`
    SELECT "mustChangePassword"
    FROM "User"
    WHERE "id" = ${userId}
    LIMIT 1
  `;
  return rows[0]?.mustChangePassword ?? false;
}

function isPasswordRecoveryRoute(req: Request): boolean {
  // The caller must still be able to inspect /me so the frontend can route to
  // the recovery screen, and must be able to submit that one recovery action.
  return req.baseUrl === "/api/auth" && (req.path === "/me" || req.path === "/change-password");
}

/**
 * Verifies the Bearer token and attaches `req.user`. After authentication it
 * enforces the PMS-owned forced-password-change gate for every protected API.
 * A gated user may call only /api/auth/me and /api/auth/change-password until
 * the credential has been replaced successfully.
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

    if (await mustChangePassword(req.user.id) && !isPasswordRecoveryRoute(req)) {
      res.status(403).json({
        error: "Password change required before using DSE PMS",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
      return;
    }

    next();
  } catch (err) {
    if (err instanceof UnprovisionedAccountError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

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
  const programmeRoles = user.roleAssignments.map((a) => ({
    role: a.role.slug as Role,
    programmeId: a.programmeId,
  }));
  return { id: user.id, email: user.email, roles, programmeRoles };
}
