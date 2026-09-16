/**
 * GitHub OAuth stays out of production UI until the verified pilot is complete.
 * Enabling the provider in Supabase alone must not advertise general access.
 */
export const GITHUB_PILOT_ENABLED = process.env.NEXT_PUBLIC_GITHUB_PILOT_ENABLED === "true";

/** The return path is kept only in same-tab session storage, never in OAuth URLs. */
export const GITHUB_OAUTH_RETURN_KEY = "dse-pms:github-oauth-return";

export function safeGithubReturnPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  try {
    const base = "https://pms.invalid";
    const url = new URL(next, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}

export function githubLoginRedirect(origin: string): string {
  const redirect = new URL("/github-sign-in", origin);
  redirect.searchParams.set("callback", "1");
  return redirect.toString();
}

export function githubLinkRedirect(origin: string): string {
  return new URL("/connect-github", origin).toString();
}
