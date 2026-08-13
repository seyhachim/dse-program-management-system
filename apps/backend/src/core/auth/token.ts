import jwt from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { DEFAULT_PROGRAMME_ID } from "../programme.ts";

/**
 * The single swap-point for auth. Two schemes coexist behind `AUTH_MODE`:
 * - `dev`: local HS256 tokens minted by `signToken` / `gen-token` (JWT_SECRET).
 * - `supabase`: JWTs issued by Supabase Auth, verified against the project's
 *   JWKS in `verifySupabaseToken`.
 * Nothing else in the app changes when switching, because every route depends
 * only on the `AuthUser` shape — and in supabase mode the caller's *role* is
 * resolved from our own `User` table, not trusted from a token claim.
 */

export type Role = "admin" | "program_coordinator" | "program_secretary" | "lecturer" | "qa_reviewer" | "student";

/**
 * Roles whose access is programme-wide rather than scoped to owned
 * courses/offerings — today that's every role except `lecturer` and
 * `student`. There's exactly one programme in the system right now, so
 * "programme-wide" and "system-wide" coincide and this list can just mirror
 * `admin`'s bypass everywhere ownership is checked (`ensureCourseAccess`,
 * `courses/router.ts`'s `ownerScope`). Once a `Programme` model exists this
 * becomes a real per-programme membership lookup instead of a flat allowlist.
 */
export const PROGRAMME_WIDE_ROLES: Role[] = ["admin", "program_coordinator", "program_secretary", "qa_reviewer"];

/**
 * One (role, programme) grant a caller holds. `programmeId: null` means the
 * grant is global (every programme) — today that's only `admin`. Issue #147
 * phase B: this is what real per-programme enforcement checks against,
 * layered on top of the coarse `roles`/`requirePermission` check, not a
 * replacement for it.
 */
export interface ProgrammeRoleAssignment {
  role: Role;
  programmeId: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  /** All roles this caller holds (issue #77 phase B) — never empty. */
  roles: Role[];
  /**
   * Same grants as `roles`, but with programme scope attached — never empty.
   * A parallel field, not a replacement for `roles`: `MeResponse`/the
   * frontend nav guards key off `roles` and must not be reshaped (deploy-skew
   * reasoning documented on `AuthUser.roles`/`MeResponse.role` in CLAUDE.md).
   */
  programmeRoles: ProgrammeRoleAssignment[];
}

/** True if any grant in `programmeRoles` for `role` is global (`programmeId: null`). */
export function hasGlobalRole(user: AuthUser, role: Role): boolean {
  return user.programmeRoles.some((a) => a.role === role && a.programmeId === null);
}

/** True if `user` holds `role` scoped to `programmeId` — globally or specifically. */
export function hasRoleInProgramme(user: AuthUser, role: Role, programmeId: string): boolean {
  return user.programmeRoles.some(
    (a) => a.role === role && (a.programmeId === null || a.programmeId === programmeId),
  );
}

/**
 * True if any of `roles` grants access to `programmeId` — globally or
 * specifically. The real, per-programme replacement for a flat
 * `roles.some(r => PROGRAMME_WIDE_ROLES.includes(r))` check. A resource with
 * no `programmeId` of its own (`programmeId: null`, e.g. an unmigrated row)
 * only matches a caller's *global* grant, never a programme-scoped one —
 * fail-closed rather than treating "unscoped" as "matches everything".
 */
export function hasAnyRoleInProgramme(user: AuthUser, roles: Role[], programmeId: string | null): boolean {
  return user.programmeRoles.some(
    (a) => roles.includes(a.role) && (a.programmeId === null || a.programmeId === programmeId),
  );
}

/** The programmeId a newly-created UserRoleAssignment for `role` should default to. */
export function defaultProgrammeIdForRole(role: Role): string | null {
  return role === "admin" ? null : DEFAULT_PROGRAMME_ID;
}

/** Build `programmeRoles` from `roles` for a token/claim that predates this field. */
function synthesizeProgrammeRoles(roles: Role[]): ProgrammeRoleAssignment[] {
  return roles.map((role) => ({ role, programmeId: defaultProgrammeIdForRole(role) }));
}

/**
 * Which auth scheme the backend verifies against.
 * - `dev` (default): local HS256 dev tokens minted by `gen-token` / `signToken`.
 * - `supabase`: JWTs issued by Supabase Auth, verified in `verifySupabaseToken`.
 * Kept as a flag so local dev and CI run without a live Supabase project.
 */
export type AuthMode = "dev" | "supabase";

export function getAuthMode(): AuthMode {
  return process.env.AUTH_MODE === "supabase" ? "supabase" : "dev";
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set. Copy .env.example to apps/backend/.env");
  }
  return secret;
}

export function signToken(
  user: AuthUser,
  expiresIn: jwt.SignOptions["expiresIn"] = "7d",
): string {
  return jwt.sign(
    { email: user.email, roles: user.roles, programmeRoles: user.programmeRoles },
    getSecret(),
    { subject: user.id, expiresIn },
  );
}

/**
 * Accepts the current `roles: Role[]` + `programmeRoles` claims, the
 * pre-#147 `roles`-only claim, and the legacy single-`role` claim signed
 * before issue #77 phase B — the live demo's `NEXT_PUBLIC_DEV_TOKEN` is a
 * 7-day token already in the wild when this ships (minted with `roles:
 * ["admin"]`, no `programmeRoles` claim), so old tokens must keep verifying
 * rather than 401ing until they naturally expire. When `programmeRoles` is
 * absent it's synthesized from `roles` via `defaultProgrammeIdForRole` — for
 * that live admin token this synthesizes `{role: "admin", programmeId:
 * null}`, a global grant, so it keeps passing every programme-scoped check
 * unconditionally (see `token.test.ts`).
 */
export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, getSecret()) as jwt.JwtPayload;
  if (!payload.sub || typeof payload.email !== "string") {
    throw new Error("Malformed token payload");
  }
  const roles = Array.isArray(payload.roles)
    ? (payload.roles as Role[])
    : typeof payload.role === "string"
      ? [payload.role as Role]
      : undefined;
  if (!roles || roles.length === 0) {
    throw new Error("Malformed token payload");
  }
  const programmeRoles = Array.isArray(payload.programmeRoles)
    ? (payload.programmeRoles as ProgrammeRoleAssignment[])
    : synthesizeProgrammeRoles(roles);
  return {
    id: payload.sub,
    email: payload.email,
    roles,
    programmeRoles,
  };
}

/** Identity extracted from a verified Supabase token — role comes from our DB, not here. */
export interface SupabaseIdentity {
  authId: string;
  email: string;
}

// Cache the remote JWKS across requests (it fetches + caches signing keys internally).
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  const url = process.env.SUPABASE_JWKS_URL;
  if (!url) {
    throw new Error(
      "SUPABASE_JWKS_URL is not set. In AUTH_MODE=supabase it must point at " +
        "https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json",
    );
  }
  jwks ??= createRemoteJWKSet(new URL(url));
  return jwks;
}

/**
 * Verifies a Supabase-issued JWT against the project's JWKS (asymmetric keys)
 * and returns only the identity (auth uid + email). Authorization role is looked
 * up from our own `User` table by the caller, so Supabase metadata can never
 * escalate a role. Throws if the token is invalid/expired or missing claims.
 */
export async function verifySupabaseToken(token: string): Promise<SupabaseIdentity> {
  const { payload } = await jwtVerify(token, getJwks());
  if (!payload.sub || typeof payload.email !== "string") {
    throw new Error("Malformed Supabase token payload");
  }
  return { authId: payload.sub, email: payload.email };
}
