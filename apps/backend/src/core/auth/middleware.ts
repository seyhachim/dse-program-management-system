import type { NextFunction, Request, Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decodeJwt } from "jose";
import { prisma } from "../db/prisma.ts";
import { AccountLinkingError, assertLegacyEmailClaim } from "./account-linking.ts";
import { assertApprovedGoogleIdentity, tokenHasGoogleIdentity } from "./google-identity-approval.ts";
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
    throw new Error("Supabase account verification is not configured");
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
      res.status(403).json({ error: "This sign-in is not linked to an authorized PMS account" });
      return;
    }
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function resolveSupabaseUser(token: string): Promise<AuthUser> {
  // Verify signature and expiration BEFORE interpreting any provider metadata.
  const { authId, email } = await verifySupabaseToken(token);
  const metadata = decodeJwt(token).app_metadata;
  const provider = metadata && typeof metadata === "object" && "provider" in metadata
    && typeof metadata.provider === "string" ? metadata.provider : null;

  const roleAssignmentsInclude = { roleAssignments: { include: { role: true } } } as const;

  // The stable Supabase UID is authoritative; provider email is never a proof
  // of identity for a pre-existing account.
  let user = await prisma.user.findUnique({ where: { authId }, include: roleAssignmentsInclude });
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email }, include: roleAssignmentsInclude });
    if (byEmail) {
      const { data, error } = byEmail.authId === null && provider === "email"
        ? await getVerificationClient().auth.admin.getUserById(authId)
        : { data: null, error: null };
      if (error) throw error;
      assertLegacyEmailClaim({ authId, email, provider }, byEmail.authId, data?.user ?? null);

      // A conditional claim avoids overwriting an identity linked concurrently.
      const claimed = await prisma.user.updateMany({
        where: { id: byEmail.id, authId: null },
        data: { authId },
      });
      if (claimed.count !== 1) throw new AccountLinkingError("Account linking conflict");
      user = await prisma.user.findUnique({ where: { authId }, include: roleAssignmentsInclude });
      if (!user || user.id !== byEmail.id) throw new AccountLinkingError("Account linking conflict");
    }
  }

  if (!user) {
    throw new UnprovisionedAccountError("No account provisioned for this login");
  }

  // Supabase can automatically attach a matching-email Google identity to an
  // existing auth UID. A valid UID and frontend /me check cannot detect that.
  // Require independent, exact provider-identity approval on the backend even
  // when Google has already been attached upstream. No email matching here.
  if (tokenHasGoogleIdentity(metadata)) {
    const { data, error } = await getVerificationClient().auth.admin.getUserById(authId);
    if (error || data.user?.id !== authId) {
      throw new AccountLinkingError("Unable to verify Google identity");
    }
    if (!user.roleAssignments.some((assignment) => assignment.role.slug === "student")) {
      throw new AccountLinkingError("Google pilot is restricted to students");
    }
    assertApprovedGoogleIdentity(
      authId,
      data.user.identities,
      process.env.GOOGLE_OAUTH_APPROVED_IDENTITIES,
    );
  }

  const roles = user.roleAssignments.map((a) => a.role.slug as Role);
  const programmeRoles = user.roleAssignments.map((a) => ({
    role: a.role.slug as Role,
    programmeId: a.programmeId,
  }));
  return { id: user.id, email: user.email, roles, programmeRoles };
}
