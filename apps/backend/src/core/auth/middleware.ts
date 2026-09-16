import type { NextFunction, Request, Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decodeJwt } from "jose";
import { prisma } from "../db/prisma.ts";
import { AccountLinkingError, assertLegacyEmailClaim } from "./account-linking.ts";
import { assertApprovedGoogleIdentity, tokenHasGoogleIdentity } from "./google-identity-approval.ts";
import { getApprovedGoogleIdentity } from "./google-approval-store.ts";
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
    throw new AccountLinkingError("Supabase account verification is not configured");
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

/** Verify the bearer token, resolve a PMS-owned identity, then enforce password recovery. */
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
    // The audit store and current Supabase identities are required to authorize
    // Google; outages fail closed instead of trusting JWT/provider/email alone.
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function resolveSupabaseUser(token: string): Promise<AuthUser> {
  // Verify signature and expiration before interpreting any provider metadata.
  const { authId, email } = await verifySupabaseToken(token);
  const metadata = decodeJwt(token).app_metadata;
  const provider = metadata && typeof metadata === "object" && "provider" in metadata
    && typeof metadata.provider === "string" ? metadata.provider : null;

  const roleAssignmentsInclude = { roleAssignments: { include: { role: true } } } as const;
  // Read-only PMS candidate lookups may precede the Admin call. An entirely
  // unknown UID/email retains the existing 403 unprovisioned API contract.
  // Never grant access, modify User.authId, or use an email candidate until
  // the current authoritative Supabase identities have been verified.
  let user = await prisma.user.findUnique({ where: { authId }, include: roleAssignmentsInclude });
  const byEmail = user ? null : await prisma.user.findUnique({ where: { email }, include: roleAssignmentsInclude });
  if (!user && !byEmail) throw new UnprovisionedAccountError("No account provisioned for this login");

  // A stale/incomplete JWT can omit Google after an automatic verified-email
  // link. Check Supabase Admin identities on EVERY potentially authorized
  // request. An outage fails closed rather than trusting stale JWT metadata.
  const { data: verified, error: verificationError } = await getVerificationClient().auth.admin.getUserById(authId);
  if (verificationError || verified.user?.id !== authId) {
    throw new AccountLinkingError("Unable to verify current sign-in identities");
  }
  const currentGoogleIdentities = verified.user.identities?.filter((identity) => identity.provider === "google") ?? [];
  const hasGoogleIdentity = tokenHasGoogleIdentity(metadata) || currentGoogleIdentities.length > 0;
  if (hasGoogleIdentity) {
    // Never approve by email or token metadata; an unbound historical PMS user
    // cannot be claimed by a Google provider under any circumstances.
    if (!user) throw new AccountLinkingError("Google identity cannot claim a PMS account by email");
    const approvedIdentityId = await getApprovedGoogleIdentity(authId, user.id).catch(() => {
      throw new AccountLinkingError("Google approval lookup unavailable");
    });
    assertApprovedGoogleIdentity(
      authId,
      verified.user.identities,
      approvedIdentityId ? JSON.stringify({ [authId]: approvedIdentityId }) : undefined,
    );
  }

  if (!user && byEmail) {
    if (hasGoogleIdentity) throw new AccountLinkingError("Google identity cannot claim a PMS account by email");
    assertLegacyEmailClaim({ authId, email, provider }, byEmail.authId, verified.user);
    const claimed = await prisma.user.updateMany({
      where: { id: byEmail.id, authId: null },
      data: { authId },
    });
    if (claimed.count !== 1) throw new AccountLinkingError("Account linking conflict");
    user = await prisma.user.findUnique({ where: { authId }, include: roleAssignmentsInclude });
    if (!user || user.id !== byEmail.id) throw new AccountLinkingError("Account linking conflict");
  }

  if (!user) throw new UnprovisionedAccountError("No account provisioned for this login");
  if (hasGoogleIdentity && !user.roleAssignments.some((assignment) => assignment.role.slug === "student")) {
    throw new AccountLinkingError("Google pilot is restricted to students");
  }

  const roles = user.roleAssignments.map((a) => a.role.slug as Role);
  const programmeRoles = user.roleAssignments.map((a) => ({
    role: a.role.slug as Role,
    programmeId: a.programmeId,
  }));
  return { id: user.id, email: user.email, roles, programmeRoles };
}
