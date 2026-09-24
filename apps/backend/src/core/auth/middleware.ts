import type { NextFunction, Request, Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "../db/prisma.ts";
import { AccountLinkingError, assertEmailOnlySupabaseIdentity, assertLegacyEmailClaim, type ConfirmedAuthUser } from "./account-linking.ts";
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

let verificationClient: SupabaseClient | undefined;

function getVerificationClient(): SupabaseClient {
  if (verificationClient) return verificationClient;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new AccountLinkingError("Supabase identity verification is unavailable");
  }
  verificationClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return verificationClient;
}

async function mustChangePassword(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mustChangePassword: true },
  });
  return user?.mustChangePassword ?? false;
}

export function isPasswordRecoveryRoute(req: Pick<Request, "baseUrl" | "path">): boolean {
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
    if (err instanceof AccountLinkingError) {
      // Deliberately do not reveal whether a PMS user exists or why verification failed.
      res.status(403).json({ error: "No account provisioned for this sign-in identity" });
      return;
    }
    if (process.env.AUTH_UAT_1143 === "1") {
      // Disposable hosted-UAT diagnostic only; never logs token, email, uid, or PII.
      // eslint-disable-next-line no-console
      console.error("[uat-1143] middleware-generic-error", err instanceof Error ? `${err.name}: ${err.message}` : "unknown");
    }
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function resolveSupabaseUser(token: string): Promise<AuthUser> {
  // Signature and expiry are checked before the token's UID is trusted.
  const { authId, email } = await verifySupabaseToken(token);

  // A currently auto-linked provider can inherit the SAME UID, even when an
  // old JWT still advertises email/password. Never authorize solely on UID or
  // token metadata: read the live Supabase Admin identity set every request.
  let verifiedAuthUser: ConfirmedAuthUser | null = null;
  try {
    const { data, error } = await getVerificationClient().auth.admin.getUserById(authId);
    if (error) throw error;
    verifiedAuthUser = data?.user ?? null;
  } catch {
    throw new AccountLinkingError("Supabase identity verification failed");
  }
  assertEmailOnlySupabaseIdentity({ authId, email }, verifiedAuthUser);

  const roleAssignmentsInclude = { roleAssignments: { include: { role: true } } } as const;
  let user = await prisma.user.findUnique({ where: { authId }, include: roleAssignmentsInclude });
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email }, include: roleAssignmentsInclude });
    if (byEmail) {
      // An existing auth UID must NEVER be replaced or accepted on email match.
      assertLegacyEmailClaim({ authId, email }, byEmail.authId, verifiedAuthUser);
      const claimed = await prisma.user.updateMany({
        where: { id: byEmail.id, authId: null },
        data: { authId },
      });
      if (claimed.count !== 1) throw new AccountLinkingError("Concurrent account linking conflict");
      user = await prisma.user.findUnique({ where: { authId }, include: roleAssignmentsInclude });
      if (!user || user.id !== byEmail.id) throw new AccountLinkingError("Account linking conflict");
    }
  }

  if (!user) {
    throw new UnprovisionedAccountError("No account provisioned for this login");
  }

  const roles = user.roleAssignments.map((a) => a.role.slug as Role);
  const programmeRoles = user.roleAssignments.map((a) => ({
    role: a.role.slug as Role,
    programmeId: a.programmeId,
  }));
  return { id: user.id, email: user.email, roles, programmeRoles };
}
