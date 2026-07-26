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
  /** Full profile (incl. name) for the resolved caller — `req.user` only carries id/email/role. */
  async me(userId: string) {
    return prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, role: true, name: true },
    });
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

    return prisma.user.upsert({
      where: { email: input.email },
      update: { authId: data.user.id, name: input.name, role: input.role },
      create: { authId: data.user.id, email: input.email, name: input.name, role: input.role },
      select: accountSelect,
    });
  },
};

export type AuthService = typeof authService;
