"use client";

import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla/adapters";

/**
 * Staging-only first-party session through the Next.js preview rewrite.
 * No static JWT, localStorage or production Supabase credentials. The server
 * stores the session in an HttpOnly cookie; a short-lived JWT authorizes
 * cross-origin requests to the isolated Render backend.
 */
type StagingAuthResult = {
  data?: { user?: { id: string }; session?: { token?: string } } | null;
  error?: { message?: string } | null;
};
type StagingAuthClient = {
  getSession(): Promise<StagingAuthResult>;
  signIn: {
    email(credentials: { email: string; password: string }): Promise<{ error?: { message?: string } | null }>;
  };
  signOut(): Promise<unknown>;
};
/** Narrow the library's huge SDK union at one reviewed, stage-only integration boundary. */
function createStagingAuthClient(url: string): StagingAuthClient {
  return createAuthClient(url, { adapter: BetterAuthVanillaAdapter() }) as unknown as StagingAuthClient;
}
let client: StagingAuthClient | null = null;

export function getStagingAuth(): StagingAuthClient {
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
