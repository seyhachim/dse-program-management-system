import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateAccountInput,
  ManageProgrammeRoleInput,
  ProgrammeRoleAssignmentView,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { permissionsForRoles } from "../../core/permissions/index.ts";
import { defaultProgrammeIdForRole, type Role } from "../../core/auth/token.ts";

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
} as const;

export class ProvisioningError extends Error {}
export class ProgrammeRoleAssignmentError extends Error {}

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

async function programmeRoleView(
  userId: string,
  programmeId: string,
  role: "qa_contributor",
): Promise<ProgrammeRoleAssignmentView> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new ProgrammeRoleAssignmentError("User not found");
  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    programmeId,
    role,
  };
}

export const authService = {
  /** Full profile (incl. name) for the resolved caller — `req.user` only carries id/email/roles. */
  async me(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        roleAssignments: { select: { role: { select: { slug: true } } } },
      },
    });
    // Every creation path writes a UserRoleAssignment row, so this is always
    // non-empty in practice (the legacy single-role column it used to fall
    // back to was dropped in issue #77 phase C).
    const roles = user.roleAssignments.map((a) => a.role.slug) as Role[];
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: roles[0],
      roles,
      permissions: await permissionsForRoles(roles),
    };
  },

  /**
   * Provision a login account: invite the email via Supabase, then upsert the
   * app `User` (role from input, authId = the new auth uid). If a profile row
   * already exists for the email, it is linked/updated rather than duplicated.
   */
  async createAccount(input: CreateAccountInput) {
    const studentProfile = input.role === "student"
      ? await prisma.student.findUnique({ where: { email: input.email } })
      : null;
    if (input.role === "student" && !studentProfile) {
      throw new ProvisioningError(
        "Create the student roster profile with this email before sending a portal invite",
      );
    }
    if (studentProfile?.userId) {
      throw new ProvisioningError("This student already has a linked portal account");
    }

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
      },
      create: {
        authId: data.user.id,
        email: input.email,
        name: input.name,
      },
      select: accountSelect,
    });

    // UserRoleAssignment is the role source of truth. Account provisioning keeps
    // its historical single-primary-role behavior, but additive QA Contributor
    // grants are preserved so re-inviting a lecturer cannot silently remove SAR work access.
    const role = await prisma.role.findUniqueOrThrow({ where: { slug: input.role } });
    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id, programmeId: defaultProgrammeIdForRole(input.role) },
    });
    await prisma.userRoleAssignment.deleteMany({
      where: {
        userId: user.id,
        roleId: { not: role.id },
        role: { slug: { not: "qa_contributor" } },
      },
    });

    if (studentProfile) {
      await prisma.student.update({
        where: { id: studentProfile.id },
        data: { userId: user.id },
      });
    }

    const roles = await prisma.userRoleAssignment.findMany({
      where: { userId: user.id },
      select: { role: { select: { slug: true } } },
      orderBy: { createdAt: "asc" },
    });
    return { ...user, role: role.slug, roles: roles.map((assignment) => assignment.role.slug) };
  },

  /** Add a narrowly-allowed programme role without replacing any existing role. */
  async assignProgrammeRole(input: ManageProgrammeRoleInput): Promise<ProgrammeRoleAssignmentView> {
    const [user, programme, role] = await Promise.all([
      prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } }),
      prisma.programme.findUnique({ where: { id: input.programmeId }, select: { id: true } }),
      prisma.role.findUnique({ where: { slug: input.role }, select: { id: true } }),
    ]);
    if (!user) throw new ProgrammeRoleAssignmentError("User not found");
    if (!programme) throw new ProgrammeRoleAssignmentError("Programme not found");
    if (!role) throw new ProgrammeRoleAssignmentError("Programme role is not installed");

    const existing = await prisma.userRoleAssignment.findUnique({
      where: { userId_roleId: { userId: input.userId, roleId: role.id } },
      select: { programmeId: true },
    });
    if (existing && existing.programmeId !== input.programmeId) {
      throw new ProgrammeRoleAssignmentError(
        "This role is already assigned to the user in a different programme",
      );
    }

    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: input.userId, roleId: role.id } },
      update: { programmeId: input.programmeId },
      create: {
        userId: input.userId,
        roleId: role.id,
        programmeId: input.programmeId,
      },
    });

    return programmeRoleView(input.userId, input.programmeId, input.role);
  },

  /** Remove only the requested additive programme role; all other roles remain intact. */
  async removeProgrammeRole(input: ManageProgrammeRoleInput): Promise<void> {
    const role = await prisma.role.findUnique({
      where: { slug: input.role },
      select: { id: true },
    });
    if (!role) throw new ProgrammeRoleAssignmentError("Programme role is not installed");

    await prisma.userRoleAssignment.deleteMany({
      where: {
        userId: input.userId,
        roleId: role.id,
        programmeId: input.programmeId,
      },
    });
  },

  async listProgrammeRoleAssignments(
    programmeId: string,
  ): Promise<ProgrammeRoleAssignmentView[]> {
    const rows = await prisma.userRoleAssignment.findMany({
      where: {
        programmeId,
        role: { slug: "qa_contributor" },
      },
      orderBy: { user: { name: "asc" } },
      select: {
        userId: true,
        programmeId: true,
        user: { select: { name: true, email: true } },
      },
    });
    return rows.flatMap((row) => row.programmeId
      ? [{
          userId: row.userId,
          userName: row.user.name,
          userEmail: row.user.email,
          programmeId: row.programmeId,
          role: "qa_contributor" as const,
        }]
      : []);
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
