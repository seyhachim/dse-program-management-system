import jwt from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * The single swap-point for auth. Two schemes coexist behind `AUTH_MODE`:
 * - `dev`: local HS256 tokens minted by `signToken` / `gen-token` (JWT_SECRET).
 * - `supabase`: JWTs issued by Supabase Auth, verified against the project's
 *   JWKS in `verifySupabaseToken`.
 * Nothing else in the app changes when switching, because every route depends
 * only on the `AuthUser` shape — and in supabase mode the caller's *role* is
 * resolved from our own `User` table, not trusted from a token claim.
 */

export type Role = "admin" | "lecturer" | "student";

export interface AuthUser {
  id: string;
  email: string;
  /** All roles this caller holds (issue #77 phase B) — never empty. */
  roles: Role[];
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
  return jwt.sign({ email: user.email, roles: user.roles }, getSecret(), {
    subject: user.id,
    expiresIn,
  });
}

/**
 * Accepts both the current `roles: Role[]` claim and the legacy single-`role`
 * claim signed before issue #77 phase B — the live demo's `NEXT_PUBLIC_DEV_TOKEN`
 * is a 7-day token already in the wild when this ships, so old tokens must keep
 * verifying rather than 401ing until they naturally expire.
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
  return {
    id: payload.sub,
    email: payload.email,
    roles,
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
