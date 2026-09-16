/**
 * GitHub OAuth stays out of production UI until the verified pilot is complete.
 * Enabling the provider in Supabase alone must not advertise general access.
 */
export const GITHUB_PILOT_ENABLED = process.env.NEXT_PUBLIC_GITHUB_PILOT_ENABLED === "true";

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

export function githubLoginRedirect(origin: string, next: string | null): string {
  const redirect = new URL("/github-sign-in", origin);
  redirect.searchParams.set("next", safeGithubReturnPath(next));
  return redirect.toString();
}

export function githubLinkRedirect(origin: string): string {
  return new URL("/connect-github", origin).toString();
}
