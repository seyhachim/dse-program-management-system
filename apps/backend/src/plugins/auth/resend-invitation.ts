import { createClient } from "@supabase/supabase-js";
import { prisma } from "../../core/db/prisma.ts";
import { ProvisioningError } from "./service.ts";

export function invitationAlreadyAccepted(user: {
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
}): boolean {
  return Boolean(user.email_confirmed_at || user.last_sign_in_at);
}

/**
 * Re-send a lecturer invitation without touching the PMS User, role assignments,
 * course/offering links, or other academic records.
 *
 * Supabase does not expose an invite-specific resend mail method. For a still
 * unconfirmed invited identity we therefore rotate only the pending Supabase
 * Auth identity, then link the existing PMS User to the new identity. Confirmed
 * users are never deleted or re-invited.
 */
export async function resendLecturerInvitation(userId: string): Promise<{ email: string }> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      roleAssignments: { some: { role: { slug: "lecturer" } } },
    },
    select: { id: true, authId: true, email: true, name: true },
  });
  if (!user) throw new ProvisioningError("Lecturer account not found");
  if (!user.authId) {
    throw new ProvisioningError("This lecturer has no pending invitation. Use Invite to DSE instead.");
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new ProvisioningError(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to resend invitations",
    );
  }
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingAuth, error: getError } = await admin.auth.admin.getUserById(user.authId);
  if (getError && getError.status !== 404) {
    throw new ProvisioningError(getError.message);
  }

  // Never rotate a confirmed/active identity. This is the academic-record-safe
  // boundary between "resend an invite" and "reset an existing account".
  if (existingAuth?.user && invitationAlreadyAccepted(existingAuth.user)) {
    throw new ProvisioningError(
      "This lecturer account is already active. Use the password recovery flow instead.",
    );
  }

  if (existingAuth?.user) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(existingAuth.user.id);
    if (deleteError && deleteError.status !== 404) {
      throw new ProvisioningError(deleteError.message);
    }
  }

  const redirectTo = process.env.SUPABASE_INVITE_REDIRECT_URL;
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(user.email, {
    data: { name: user.name, role: "lecturer" },
    ...(redirectTo ? { redirectTo } : {}),
  });
  if (inviteError || !invited?.user) {
    throw new ProvisioningError(inviteError?.message ?? "Supabase could not resend the invitation");
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { authId: invited.user.id },
    });
  } catch (error) {
    // Compensate if linking fails so a newly-created orphan auth identity does
    // not block a later retry. The PMS User and all academic relations remain.
    await admin.auth.admin.deleteUser(invited.user.id).catch(() => undefined);
    throw error;
  }

  return { email: user.email };
}
