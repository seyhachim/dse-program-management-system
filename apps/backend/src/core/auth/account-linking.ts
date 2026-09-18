/**
 * A provider email is contact information, not proof that its GitHub owner is
 * the already-provisioned PMS user. Only a verified Supabase *email* identity
 * may claim a historical PMS account that has never had an auth UID.
 */
export class AccountLinkingError extends Error {}

export type LegacyEmailIdentity = {
  authId: string;
  email: string;
  provider: string | null;
};

export type ConfirmedAuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
};

export function assertLegacyEmailClaim(
  identity: LegacyEmailIdentity,
  existingAuthId: string | null,
  confirmedUser: ConfirmedAuthUser | null,
): void {
  if (existingAuthId !== null) {
    throw new AccountLinkingError("This PMS account is already linked to another sign-in identity");
  }
  if (
    identity.provider !== "email" ||
    confirmedUser?.id !== identity.authId ||
    confirmedUser.email?.toLowerCase() !== identity.email.toLowerCase() ||
    !confirmedUser.email_confirmed_at
  ) {
    throw new AccountLinkingError("This sign-in cannot claim an existing PMS account");
  }
}
