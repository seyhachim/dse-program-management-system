import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../db/prisma.ts";
import type { AuthUser } from "./token.ts";

/** SQL-managed, server-only security tables in pms_auth_security; never expose to Data API. */
type ApprovalEvent = {
  user_id: string;
  google_identity_id: string;
  action: "approved" | "revoked";
};
type LinkIntent = { id: string };

export class GoogleApprovalError extends Error {
  constructor(message: string, readonly status: 403 | 409 | 503 = 403) {
    super(message);
  }
}

export function googlePilotBackendEnabled(): boolean {
  return process.env.AUTH_MODE === "supabase" && process.env.GOOGLE_OAUTH_APPROVAL_ENABLED === "true";
}

function requirePilot(): void {
  if (!googlePilotBackendEnabled()) throw new GoogleApprovalError("Google approval pilot is disabled");
}

function authClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new GoogleApprovalError("Auth verification unavailable", 503);
  // Never share a browser session or persist password-login tokens.
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function verifiedAuthUser(authUid: string) {
  const { data, error } = await authClient().auth.admin.getUserById(authUid);
  if (error || data.user?.id !== authUid) throw new GoogleApprovalError("Auth identity could not be verified", 503);
  return data.user;
}

/** Verify a *fresh password exchange with Supabase Auth*, not a refreshed JWT iat. */
async function verifyPassword(authUid: string, password: string): Promise<void> {
  const current = await verifiedAuthUser(authUid);
  if (!current.email_confirmed_at || !current.email ||
      !current.identities?.some((identity) => identity.provider === "email")) {
    throw new GoogleApprovalError("A verified existing password identity is required");
  }
  const { data, error } = await authClient().auth.signInWithPassword({
    email: current.email,
    password,
  });
  if (error || data.user?.id !== authUid) {
    throw new GoogleApprovalError("Fresh password verification failed");
  }
}

function requireStudent(user: AuthUser): void {
  // A user with any staff privilege cannot use the student-only pilot.
  if (user.roles.length !== 1 || user.roles[0] !== "student") {
    throw new GoogleApprovalError("Only nonprivileged students can link Google");
  }
}

function requireIndependentAdmin(user: AuthUser, targetUserId: string): void {
  if (user.id === targetUserId ||
      !user.programmeRoles.some((role) => role.role === "admin" && role.programmeId === null)) {
    throw new GoogleApprovalError("Independent global administrator approval required");
  }
}

async function lockUid(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], authUid: string) {
  // Serialize decisions for the same UID; index-ordered events then resolve deterministically.
  await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtext(${authUid}))`;
}

/** A signed-in student verifies their *existing* PMS password before OAuth. */
export async function recordGoogleLinkIntent(user: AuthUser, password: string): Promise<{ expiresAt: string }> {
  requirePilot();
  requireStudent(user);
  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { authId: true, mustChangePassword: true, studentProfile: { select: { status: true, studentId: true } } } });
  if (!record?.authId || record.mustChangePassword || record.studentProfile?.status !== "Active" || !record.studentProfile.studentId) {
    throw new GoogleApprovalError("Verified active student account and official student ID required");
  }
  const before = await verifiedAuthUser(record.authId);
  if (before.identities?.some((identity) => identity.provider === "google")) {
    throw new GoogleApprovalError("Google is already linked; request an identity review instead", 409);
  }
  await verifyPassword(record.authId, password);
  const uid = record.authId;
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await prisma.$transaction(async (tx) => {
    await lockUid(tx, uid);
    await tx.$executeRaw`UPDATE pms_auth_security.google_link_intent SET consumed_at = clock_timestamp()
      WHERE user_id = ${user.id} AND auth_uid = ${uid} AND consumed_at IS NULL`;
    await tx.$executeRaw`INSERT INTO pms_auth_security.google_link_intent (id, user_id, auth_uid, expires_at)
      VALUES (${id}, ${user.id}, ${uid}, ${expiresAt})`;
  });
  return { expiresAt: expiresAt.toISOString() };
}

/** Current revocation always wins; no cached/env approval can override database history. */
export async function getApprovedGoogleIdentity(authUid: string, userId: string): Promise<string | null> {
  if (!googlePilotBackendEnabled()) return null;
  try {
    const events = await prisma.$queryRaw<ApprovalEvent[]>`
      SELECT user_id, google_identity_id, action
      FROM pms_auth_security.google_identity_approval_event
      WHERE auth_uid = ${authUid}
      ORDER BY id DESC LIMIT 1`;
    const latest = events[0];
    return latest?.action === "approved" && latest.user_id === userId ? latest.google_identity_id : null;
  } catch {
    throw new GoogleApprovalError("Approval store unavailable", 503);
  }
}

type ApprovalInput = {
  targetUserId: string;
  authUid: string;
  googleIdentityId: string;
  evidenceReference: string;
  reason: string;
  adminPassword: string;
};

export async function approveGoogleIdentity(operator: AuthUser, input: ApprovalInput): Promise<void> {
  requirePilot();
  requireIndependentAdmin(operator, input.targetUserId);
  const admin = await prisma.user.findUnique({ where: { id: operator.id }, select: { authId: true } });
  if (!admin?.authId) throw new GoogleApprovalError("Operator must use an existing Supabase password account");
  await verifyPassword(admin.authId, input.adminPassword);

  const target = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { authId: true, mustChangePassword: true, studentProfile: { select: { status: true, studentId: true } }, roleAssignments: { select: { role: { select: { slug: true } } } } },
  });
  if (target?.authId !== input.authUid || target.mustChangePassword || target.studentProfile?.status !== "Active" ||
      !target.studentProfile.studentId || target.roleAssignments.length !== 1 || target.roleAssignments[0]?.role.slug !== "student") {
    throw new GoogleApprovalError("Target student identity is not eligible");
  }
  const verified = await verifiedAuthUser(input.authUid);
  const google = verified.identities?.filter((identity) => identity.provider === "google") ?? [];
  if (google.length !== 1 || google[0]?.id !== input.googleIdentityId) {
    throw new GoogleApprovalError("Exact Google identity does not match authoritative Auth", 409);
  }

  await prisma.$transaction(async (tx) => {
    await lockUid(tx, input.authUid);
    // Revalidate the canonical mapping under a DB lock; no email matching or User writes.
    const bound = await tx.user.findUnique({ where: { id: input.targetUserId }, select: { authId: true } });
    if (bound?.authId !== input.authUid) throw new GoogleApprovalError("Student mapping changed", 409);
    const latest = await tx.$queryRaw<ApprovalEvent[]>`
      SELECT user_id, google_identity_id, action
      FROM pms_auth_security.google_identity_approval_event
      WHERE auth_uid = ${input.authUid} ORDER BY id DESC LIMIT 1`;
    if (latest[0]?.action === "approved") throw new GoogleApprovalError("Revoke existing approval first", 409);
    const intents = await tx.$queryRaw<LinkIntent[]>`
      SELECT id FROM pms_auth_security.google_link_intent
      WHERE user_id = ${input.targetUserId} AND auth_uid = ${input.authUid}
        AND consumed_at IS NULL AND expires_at > clock_timestamp()
      ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`;
    const intent = intents[0];
    if (!intent) throw new GoogleApprovalError("Fresh server-verified student consent is missing or expired", 409);
    const used = await tx.$executeRaw`
      UPDATE pms_auth_security.google_link_intent SET consumed_at = clock_timestamp()
      WHERE id = ${intent.id} AND consumed_at IS NULL AND expires_at > clock_timestamp()`;
    if (used !== 1) throw new GoogleApprovalError("Link intent was already used", 409);
    await tx.$executeRaw`
      INSERT INTO pms_auth_security.google_identity_approval_event
        (user_id, auth_uid, google_identity_id, action, actor_user_id, evidence_reference, reason, link_intent_id)
      VALUES (${input.targetUserId}, ${input.authUid}, ${input.googleIdentityId}, 'approved', ${operator.id},
        ${input.evidenceReference}, ${input.reason}, ${intent.id})`;
  });
}

export async function revokeGoogleIdentity(operator: AuthUser, input: ApprovalInput): Promise<void> {
  requirePilot();
  requireIndependentAdmin(operator, input.targetUserId);
  const admin = await prisma.user.findUnique({ where: { id: operator.id }, select: { authId: true } });
  if (!admin?.authId) throw new GoogleApprovalError("Operator must use an existing Supabase password account");
  await verifyPassword(admin.authId, input.adminPassword);
  await prisma.$transaction(async (tx) => {
    await lockUid(tx, input.authUid);
    const latest = await tx.$queryRaw<ApprovalEvent[]>`
      SELECT user_id, google_identity_id, action
      FROM pms_auth_security.google_identity_approval_event
      WHERE auth_uid = ${input.authUid} ORDER BY id DESC LIMIT 1`;
    if (latest[0]?.action !== "approved" || latest[0].user_id !== input.targetUserId ||
        latest[0].google_identity_id !== input.googleIdentityId) {
      throw new GoogleApprovalError("No matching active approval", 409);
    }
    await tx.$executeRaw`
      INSERT INTO pms_auth_security.google_identity_approval_event
        (user_id, auth_uid, google_identity_id, action, actor_user_id, evidence_reference, reason)
      VALUES (${input.targetUserId}, ${input.authUid}, ${input.googleIdentityId}, 'revoked', ${operator.id},
        ${input.evidenceReference}, ${input.reason})`;
  });
}
