/**
 * Supabase validates the JWT, but an upstream provider merge can change which
 * credentials own that UID without changing its already-issued JWT. PMS must
 * refuse any unapproved non-email identity before resolving its own roles.
 */
export class AccountLinkingError extends Error {}

export type VerifiedSupabaseIdentity = {
  authId: string;
  email: string;
};

export type ConfirmedAuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  identities?: readonly { provider?: string | null }[] | null;
};

/**
 * Require a CURRENT Admin-API identity, not token app_metadata. A stale
 * email-only JWT must also fail if a provider was auto-linked after issuance.
 * Keep external providers disabled until their own audited approval exists.
 */
export function assertEmailOnlySupabaseIdentity(
  identity: VerifiedSupabaseIdentity,
  confirmedUser: ConfirmedAuthUser | null,
): void {
  if (
    confirmedUser?.id !== identity.authId ||
    !confirmedUser.email_confirmed_at ||
    confirmedUser.email?.toLowerCase() !== identity.email.toLowerCase() ||
    !Array.isArray(confirmedUser.identities) ||
    confirmedUser.identities.length !== 1 ||
    confirmedUser.identities[0]?.provider !== "email"
  ) {
    throw new AccountLinkingError("This sign-in identity is not approved for PMS access");
  }
}

/** A historical, never-bound PMS User may be claimed only by its verified email identity. */
export function assertLegacyEmailClaim(
  identity: VerifiedSupabaseIdentity,
  existingAuthId: string | null,
  confirmedUser: ConfirmedAuthUser | null,
): void {
  if (existingAuthId !== null) {
    throw new AccountLinkingError("This PMS account belongs to another authentication identity");
  }
  assertEmailOnlySupabaseIdentity(identity, confirmedUser);
}
