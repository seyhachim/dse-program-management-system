import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CreateAccountInput } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

/**
 * Auth service: admin-only account provisioning. Creates a Supabase auth
 * credential via the Admin API (service_role key — server-only, never shipped to
 * the browser) and links it to an app `User` row. `inviteUserByEmail` sends the
 * invite so the new lecturer sets their own password; no plaintext password ever
 * transits our API. Idempotent on email — re-inviting reuses the existing row.
 */

/** A lean shape mirroring how lecturers are surfaced elsewhere. */
const accountSelect = {
  id: true,
  authId: true,
  name: true,
  email: true,
  role: true,
} as const;

export class ProvisioningError extends Error {}

let adminClient: SupabaseClient | undefined;

/** Lazily build the service_role admin client so dev mode can run without Supabase env. */
function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new ProvisioningError(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to create accounts",
    );
  }
  adminClient ??= createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

export const authService = {
  /** Full profile (incl. name) for the resolved caller — `req.user` only carries id/email/roles. */
  async me(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        roleAssignments: { select: { role: { select: { slug: true } } } },
      },
    });
    // Fall back to the legacy single role if a row somehow has no assignments
    // yet — see the same fallback in core/auth/middleware.ts.
    const roles = user.roleAssignments.map((a) => a.role.slug);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      roles: roles.length > 0 ? roles : [user.role],
    };
  },

  /**
   * Provision a login account: invite the email via Supabase, then upsert the
   * app `User` (role from input, authId = the new auth uid). If a profile row
   * already exists for the email, it is linked/updated rather than duplicated.
   */
  async createAccount(input: CreateAccountInput) {
    const admin = getAdminClient();
    const redirectTo = process.env.SUPABASE_INVITE_REDIRECT_URL;

    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      data: { name: input.name, role: input.role },
      ...(redirectTo ? { redirectTo } : {}),
    });
    if (error || !data?.user) {
      throw new ProvisioningError(error?.message ?? "Supabase could not invite the user");
    }

    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: {
        authId: data.user.id,
        name: input.name,
        role: input.role,
        roleRef: { connect: { slug: input.role } },
      },
      create: {
        authId: data.user.id,
        email: input.email,
        name: input.name,
        role: input.role,
        roleRef: { connect: { slug: input.role } },
      },
      select: accountSelect,
    });

    // UserRoleAssignment (issue #77 phase B) is what enforcement now reads —
    // keep it populated here, not just by seed.ts. Reassigning an existing
    // email to a different role also drops its old assignment, mirroring the
    // roleRef overwrite just above.
    const role = await prisma.role.findUniqueOrThrow({ where: { slug: input.role } });
    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
    await prisma.userRoleAssignment.deleteMany({
      where: { userId: user.id, roleId: { not: role.id } },
    });

    return { ...user, roles: [role.slug] };
  },

  /**
   * Called via the registry when another plugin deletes a User (e.g. lecturers)
   * so the linked Supabase Auth identity doesn't outlive the app row — without
   * this, the login stays active (harmless — resolveSupabaseUser then 403s as
   * unprovisioned) and permanently blocks re-inviting that email, since
   * `inviteUserByEmail` rejects an address already registered in Supabase.
   * A `null` authId (dev-created rows, never provisioned) is a no-op, so this
   * is safe to call unconditionally and never requires Supabase env locally.
   */
  async deleteAccountForUser(authId: string | null): Promise<void> {
    if (!authId) return;
    const admin = getAdminClient();
    const { error } = await admin.auth.admin.deleteUser(authId);
    // Already gone is success, not failure — keeps this idempotent/retry-safe.
    if (error && error.status !== 404) {
      throw new ProvisioningError(error.message);
    }
  },
};

export type AuthService = typeof authService;
