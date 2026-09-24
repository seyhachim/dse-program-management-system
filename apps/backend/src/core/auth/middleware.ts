import type { NextFunction, Request, Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decodeJwt } from "jose";
import { prisma } from "../db/prisma.ts";
import {
  AccountLinkingError,
  assertCurrentSupabaseIdentity,
  assertEmailOnlySupabaseIdentity,
  assertLegacyEmailClaim,
  type ConfirmedAuthUser,
} from "./account-linking.ts";
import { assertApprovedGoogleIdentity, tokenHasGoogleIdentity } from "./google-identity-approval.ts";
import { getApprovedGoogleIdentity } from "./google-approval-store.ts";
import { resolveRequestAuthOnce } from "./request-auth-cache.ts";
import {
  getAuthMode,
  verifySupabaseToken,
  verifyToken,
  type AuthUser,
  type Role,
} from "./token.ts";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

class UnprovisionedAccountError extends Error {}
class PasswordChangeRequiredError extends Error {}

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
  return req.baseUrl === "/api/auth" && (req.path === "/me" || req.path === "/change-password");
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  try {
    await resolveRequestAuthOnce(req, async () => {
      const user = getAuthMode() === "supabase" ? await resolveSupabaseUser(token) : verifyToken(token);

      // Preserve #1150: cache only after the complete authorization boundary
      // succeeds. Failed, password-gated, or unapproved Google requests are
      // never cached and therefore cannot bypass a later middleware invocation.
      if (await mustChangePassword(user.id) && !isPasswordRecoveryRoute(req)) {
        throw new PasswordChangeRequiredError();
      }

      return user;
    });

    next();
  } catch (err) {
    if (err instanceof PasswordChangeRequiredError) {
      res.status(403).json({
        error: "Password change required before using DSE PMS",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
      return;
    }
    if (err instanceof UnprovisionedAccountError) {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err instanceof AccountLinkingError) {
      res.status(403).json({ error: "No account provisioned for this sign-in identity" });
      return;
    }
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function resolveSupabaseUser(token: string): Promise<AuthUser> {
  const { authId, email } = await verifySupabaseToken(token);
  const metadata = decodeJwt(token).app_metadata;

  let verifiedAuthUser: ConfirmedAuthUser | null = null;
  try {
    const { data, error } = await getVerificationClient().auth.admin.getUserById(authId);
    if (error) throw error;
    verifiedAuthUser = data?.user ?? null;
  } catch {
    throw new AccountLinkingError("Supabase identity verification failed");
  }

  assertCurrentSupabaseIdentity({ authId, email }, verifiedAuthUser);

  const currentGoogleIdentities =
    verifiedAuthUser.identities?.filter((identity) => identity.provider === "google") ?? [];
  const hasGoogleIdentity = tokenHasGoogleIdentity(metadata) || currentGoogleIdentities.length > 0;

  const roleAssignmentsInclude = { roleAssignments: { include: { role: true } } } as const;
  let user = await prisma.user.findUnique({ where: { authId }, include: roleAssignmentsInclude });

  if (hasGoogleIdentity) {
    // Google never claims a PMS account by email. The exact UID must already be
    // bound, student-only, and independently approved in the restricted store.
    if (!user) throw new AccountLinkingError("Google identity cannot claim a PMS account by email");
    if (user.roleAssignments.length !== 1 || user.roleAssignments[0]?.role.slug !== "student") {
      throw new AccountLinkingError("Google pilot is restricted to nonprivileged students");
    }
    const approvedIdentityId = await getApprovedGoogleIdentity(authId, user.id).catch(() => {
      throw new AccountLinkingError("Google approval lookup unavailable");
    });
    assertApprovedGoogleIdentity(
      authId,
      verifiedAuthUser.identities,
      approvedIdentityId ? JSON.stringify({ [authId]: approvedIdentityId }) : undefined,
    );
  } else {
    // Preserve the #1143 password-only fail-closed boundary.
    assertEmailOnlySupabaseIdentity({ authId, email }, verifiedAuthUser);

    if (!user) {
      const byEmail = await prisma.user.findUnique({ where: { email }, include: roleAssignmentsInclude });
      if (byEmail) {
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
