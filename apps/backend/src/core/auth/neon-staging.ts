import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { prisma } from "../db/prisma.ts";
import { validateNeonStagingAuthEnvironment } from "../config/auth.ts";
import type { AuthUser, Role } from "./token.ts";

/** Staging-only verifier: signatures must come from the EXACT separate Neon project. */
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export interface NeonStagingIdentity {
  authId: string;
  email: string;
}

export async function verifyNeonStagingJwt(
  token: string,
  authBaseUrl: string,
  keyOverride?: JWTVerifyGetKey,
): Promise<NeonStagingIdentity> {
  const origin = new URL(authBaseUrl).origin;
  const key = keyOverride ?? (() => {
    let current = keys.get(authBaseUrl);
    if (!current) {
      current = createRemoteJWKSet(new URL(authBaseUrl + "/.well-known/jwks.json"));
      keys.set(authBaseUrl, current);
    }
    return current;
  })();
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["EdDSA"],
    issuer: origin,
    audience: origin,
    maxTokenAge: "15m",
  });
  if (!payload.sub || !/^[0-9a-fA-F-]{36}$/.test(payload.sub) ||
      typeof payload.email !== "string" || !payload.email.includes("@") ||
      payload.banned === true) {
    throw new Error("Invalid staging identity");
  }
  // Roles and programme grants in JWT claims are deliberately ignored.
  return { authId: payload.sub, email: payload.email };
}

interface StagingUserRow {
  id: string;
  email: string;
  banned: boolean | null;
}

/** No auto-linking, no email-based fallback and NO Supabase Admin call. */
export async function resolveNeonStagingUser(token: string): Promise<AuthUser> {
  const baseUrl = validateNeonStagingAuthEnvironment(process.env);
  const identity = await verifyNeonStagingJwt(token, baseUrl);
  const matchingAuthUsers = await prisma.$queryRaw<StagingUserRow[]>`
    SELECT id::text AS id, email, banned
    FROM neon_auth."user"
    WHERE id::text = ${identity.authId}
    LIMIT 1
  `;
  if (matchingAuthUsers.length !== 1 || matchingAuthUsers[0]?.banned ||
      matchingAuthUsers[0]?.email !== identity.email) {
    throw new Error("Staging identity no longer active");
  }
  const user = await prisma.user.findUnique({
    where: { authId: identity.authId },
    include: { roleAssignments: { include: { role: true } } },
  });
  if (!user || user.email !== identity.email) {
    // Unknown Neon users never receive PMS roles, including newly signed up users.
    throw new Error("Staging identity not explicitly provisioned in PMS");
  }
  const assignments = user.roleAssignments.filter((a) => a.role.active);
  if (!assignments.length) throw new Error("Staging identity has no active PMS roles");
  const roles = assignments.map((a) => a.role.slug as Role);
  const programmeRoles = assignments.map((a) => ({
    role: a.role.slug as Role,
    programmeId: a.programmeId,
  }));
  return { id: user.id, email: user.email, roles, programmeRoles };
}
