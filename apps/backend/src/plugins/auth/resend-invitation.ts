import { createClient } from "@supabase/supabase-js";
import { prisma } from "../../core/db/prisma.ts";
import { ProvisioningError } from "./service.ts";

export type ResendableInvitationRole = "lecturer" | "student";

export function invitationIsPending(user: {
  invited_at?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  last_sign_in_at?: string | null;
}): boolean {
  return Boolean(
    user.invited_at &&
      !user.email_confirmed_at &&
      !user.confirmed_at &&
      !user.last_sign_in_at,
  );
}

export function invitationEmailsMatch(
  expected: string,
  actual: string | null | undefined,
): boolean {
  return Boolean(actual && expected.trim().toLowerCase() === actual.trim().toLowerCase());
}

export function invitationMetadata(name: string, role: ResendableInvitationRole) {
  return { name, role } as const;
}

function accountLabel(role: ResendableInvitationRole): string {
  return role === "lecturer" ? "Lecturer" : "Student portal";
}

/**
 * Rotate only a still-pending Supabase invitation for the requested PMS role.
 * Confirmed, signed-in, non-invite, wrong-role, or email-mismatched identities
 * fail closed and are never deleted.
 */
async function resendRoleInvitation(
  userId: string,
  role: ResendableInvitationRole,
  expectedEmail?: string,
): Promise<{ email: string }> {
  const label = accountLabel(role);
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      roleAssignments: { some: { role: { slug: role } } },
    },
    select: { id: true, authId: true, email: true, name: true },
  });
  if (!user) throw new ProvisioningError(`${label} account not found`);

  if (expectedEmail && !invitationEmailsMatch(expectedEmail, user.email)) {
    throw new ProvisioningError(
      `The linked PMS User email does not match this ${role === "student" ? "student" : "lecturer"}. No auth record was changed.`,
    );
  }

  if (!user.authId) {
    throw new ProvisioningError(
      role === "lecturer"
        ? "This lecturer has no pending invitation. Use Invite to DSE instead."
        : "This student has no pending portal invitation. Use Send portal invite first.",
    );
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

  if (existingAuth?.user) {
    if (!invitationEmailsMatch(user.email, existingAuth.user.email)) {
      throw new ProvisioningError(
        `The linked Supabase identity email does not match this ${role === "student" ? "student" : "lecturer"}. No auth record was changed.`,
      );
    }

    if (!invitationIsPending(existingAuth.user)) {
      throw new ProvisioningError(
        role === "lecturer"
          ? "This lecturer account is not a pending invitation. Use password recovery for an active account."
          : "This student portal account is already activated or is not a pending invitation. No invitation was changed.",
      );
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(existingAuth.user.id);
    if (deleteError && deleteError.status !== 404) {
      throw new ProvisioningError(deleteError.message);
    }
  }

  const redirectTo = process.env.SUPABASE_INVITE_REDIRECT_URL;
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(user.email, {
    data: invitationMetadata(user.name, role),
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
    // not block a later retry. PMS role, Student linkage, and academic relations
    // are never rewritten by this flow.
    await admin.auth.admin.deleteUser(invited.user.id).catch(() => undefined);
    throw error;
  }

  return { email: user.email };
}

/** Preserve the existing lecturer API contract and behavior. */
export async function resendLecturerInvitation(userId: string): Promise<{ email: string }> {
  return resendRoleInvitation(userId, "lecturer");
}

/**
 * Re-send a Student Portal invitation by canonical Student UUID. The official
 * Student ID is intentionally not required: current provisional students are
 * email-identified until the institutional identifier is issued (#1032).
 */
export async function resendStudentInvitation(studentId: string): Promise<{ email: string }> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { email: true, userId: true, status: true },
  });
  if (!student) throw new ProvisioningError("Student record not found");
  if (student.status !== "Active") {
    throw new ProvisioningError("Only Active students can receive Student Portal invitations");
  }
  if (!student.email) {
    throw new ProvisioningError("Add an institutional email before resending a portal invitation");
  }
  if (!student.userId) {
    throw new ProvisioningError("This student has no pending portal invitation. Use Send portal invite first.");
  }

  return resendRoleInvitation(student.userId, "student", student.email);
}
