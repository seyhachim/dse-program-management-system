"use client";

import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla/adapters";

/**
 * Staging-only first-party session through the Next.js preview rewrite.
 * No static JWT, localStorage or production Supabase credentials. The server
 * stores the session in an HttpOnly cookie; a short-lived JWT authorizes
 * cross-origin requests to the isolated Render backend.
 */
function createStagingAuthClient(url: string) {
  return createAuthClient(url, { adapter: BetterAuthVanillaAdapter() });
}
type StagingAuthClient = ReturnType<typeof createStagingAuthClient>;
let client: StagingAuthClient | null = null;

export function getStagingAuth() {
  if (typeof window === "undefined" ||
      process.env.NEXT_PUBLIC_AUTH_MODE !== "neon-staging" ||
      process.env.NEXT_PUBLIC_STAGING_MODE !== "true") {
    throw new Error("Isolated staging authentication is unavailable");
  }
  client ??= createStagingAuthClient(`${window.location.origin}/staging-auth`);
  return client;
}

export async function stagingBearerToken(): Promise<string | null> {
  const { data, error } = await getStagingAuth().getSession();
  const session = data?.session;
  const sessionToken = session && "token" in session ? session.token : undefined;
  if (error || typeof sessionToken !== "string" || !sessionToken) return null;
  return sessionToken;
}

/** A successful login/logout invalidates role-gated app caches. */
export function notifyStagingAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("dse-staging-identity-change"));
  }
}
