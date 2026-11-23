/** Google login is private pilot-only; both frontend and backend pilot flags must be explicitly enabled. */
export const GOOGLE_PILOT_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_PILOT_ENABLED === "true";

/** Keep the return path out of the URL sent to Google and Supabase. */
export const GOOGLE_OAUTH_RETURN_KEY = "dse-pms:google-oauth-return";
export const GOOGLE_LINK_UID_KEY = "dse-pms:google-link-uid";

/** Reject external, protocol-relative and backslash-based return paths. */
export function safeGoogleReturnPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  try {
    const origin = "https://pms.invalid";
    const target = new URL(next, origin);
    return target.origin === origin ? `${target.pathname}${target.search}${target.hash}` : "/";
  } catch {
    return "/";
  }
}

/** Fresh password sign-in must not silently switch the PMS account to another UID. */
export function assertSameGoogleLinkUid(originalUid: string, freshUid: string | undefined): void {
  if (!originalUid || !freshUid || originalUid !== freshUid) {
    throw new Error("The authenticated account changed during Google linking");
  }
}

export function googleLoginRedirect(origin: string): string {
  const callback = new URL("/google-sign-in", origin);
  callback.searchParams.set("callback", "1");
  return callback.toString();
}

/** Pending Google links cannot enter the PMS shell until independently approved. */
export function googleLinkRedirect(origin: string): string {
  const callback = new URL("/google-link/callback", origin);
  return callback.toString();
}
