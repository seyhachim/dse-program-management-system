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
  // Better Auth's JWT plugin endpoint returns a signed JWT. The session token is
  // an opaque cookie/session identifier and must NEVER be sent to the PMS API.
  token(): Promise<{ data?: { token?: string } | null; error?: { message?: string } | null }>;
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

/**
 * Obtain a signed JWT specifically for the isolated Render API. The Better Auth
 * getSession().session.token value can be opaque, even when a session is valid.
 * Fail closed if the JWT plugin is unavailable or returns malformed data.
 */
export async function stagingBearerToken(): Promise<string | null> {
  try {
    const { data, error } = await getStagingAuth().token();
    const token = data?.token;
    if (error || typeof token !== "string" || token.split(".").length !== 3) return null;
    return token;
  } catch {
    return null;
  }
}

const IDENTITY_CHANGE_EVENT = "dse-staging-identity-change";
const IDENTITY_CHANGE_CHANNEL = "dse-pms-staging-identity";
let identityChannel: BroadcastChannel | null = null;

// Sign-in/out in another same-origin preview tab must evict cached /me and
// protected queries in this tab too. Do not persist identities or JWTs here.
if (typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_AUTH_MODE === "neon-staging" &&
    typeof BroadcastChannel !== "undefined") {
  try {
    identityChannel = new BroadcastChannel(IDENTITY_CHANGE_CHANNEL);
    identityChannel.onmessage = (event: MessageEvent) => {
      if (event.data === "identity-change") {
        window.dispatchEvent(new Event(IDENTITY_CHANGE_EVENT));
      }
    };
  } catch {
    // BroadcastChannel is optional; current-tab session handling stays secure.
  }
}

/** A successful login/logout invalidates role-gated app caches in every open tab. */
export function notifyStagingAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(IDENTITY_CHANGE_EVENT));
    identityChannel?.postMessage("identity-change");
  }
}
