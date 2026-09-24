import { AccountLinkingError } from "./account-linking.ts";

/**
 * Supabase may attach Google to an existing auth UID by verified-email match,
 * without the student's explicit PMS account-linking action. The UID alone is
 * therefore insufficient: an operator must independently approve the exact
 * Supabase UID + Google identity ID pair. This is an owner-controlled pilot
 * configuration, never a roster-email match or browser-controlled allowlist.
 */
export type ProviderIdentity = { id?: string; provider?: string };

export function assertApprovedGoogleIdentity(
  authUid: string,
  identities: readonly ProviderIdentity[] | null | undefined,
  approvalsJson: string | undefined,
): void {
  const google = identities?.filter((identity) => identity.provider === "google") ?? [];
  if (google.length !== 1 || !google[0]?.id) {
    throw new AccountLinkingError("Google identity requires operator review");
  }

  let approvals: unknown;
  try {
    approvals = JSON.parse(approvalsJson ?? "");
  } catch {
    throw new AccountLinkingError("Google identity approval is not configured");
  }
  if (
    !approvals ||
    typeof approvals !== "object" ||
    Array.isArray(approvals) ||
    Object.values(approvals).some((value) => typeof value !== "string") ||
    (approvals as Record<string, string>)[authUid] !== google[0].id
  ) {
    throw new AccountLinkingError("Google identity is not approved for this PMS account");
  }
}

/** Use verified JWT app_metadata only as a trigger; check actual identities via Supabase Admin API. */
export function tokenHasGoogleIdentity(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const { provider, providers } = metadata as { provider?: unknown; providers?: unknown };
  return provider === "google" || (Array.isArray(providers) && providers.includes("google"));
}
