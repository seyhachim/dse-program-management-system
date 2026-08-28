import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ChangePasswordInput,
  CreateAccountInput,
  ManageProgrammeRoleInput,
  ProgrammeRoleAssignmentView,
  TemporaryPasswordResponse,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { permissionsForRoles } from "../../core/permissions/index.ts";
import { defaultProgrammeIdForRole, type Role } from "../../core/auth/token.ts";

/**
 * Auth service: privileged account provisioning and recovery. Supabase Admin API
 * access is server-only; no service-role credential is ever exposed to a client.
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
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for account administration",
    );
  }
  adminClient ??= createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

function createTemporaryPassword(): string {
  // 24 URL-safe random characters plus explicit character classes required by
  // ChangePasswordInput. Never log or persist the generated value.
  return `${randomBytes(18).toString("base64url")}!Aa7`;
}

async function readMustChangePassword(userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ mustChangePassword: boolean }>>`
    SELECT "mustChangePassword"
    FROM "User"
    WHERE "id" = ${userId}
    LIMIT 1
  `;
  return rows[0]?.mustChangePassword ?? false;
}

async function setMustChangePassword(userId: string, value: boolean): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "User"
    SET "mustChangePassword" = ${value}
    WHERE "id" = ${userId}
  `;
}

async function recordSecurityAudit(
  action: "TemporaryPasswordSet" | "PasswordChanged",
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "UserSecurityAuditEvent" ("id", "action", "actorUserId", "targetUserId", "createdAt")
    VALUES (gen_random_uuid(), ${action}::"UserSecurityAuditAction", ${actorUserId}, ${targetUserId}, CURRENT_TIMESTAMP)
  `;
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
    const roles = user.roleAssignments.map((a) => a.role.slug) as Role[];
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: roles[0],
      roles,
      permissions: await permissionsForRoles(roles),
      mustChangePassword: await readMustChangePassword(user.id),
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

  /**
   * Admin recovery for an already-active lecturer account. The PMS user id is
   * authoritative; the browser never supplies a Supabase uid. Flag first so a
   * successful credential reset can never leave normal PMS access enabled.
   */
  async setTemporaryPassword(
    actorUserId: string,
    targetUserId: string,
  ): Promise<TemporaryPasswordResponse> {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        authId: true,
        roleAssignments: { select: { role: { select: { slug: true } } } },
      },
    });
    if (!target) throw new ProvisioningError("Lecturer account not found");
    if (!target.roleAssignments.some((assignment) => assignment.role.slug === "lecturer")) {
      throw new ProvisioningError("Temporary password recovery is only available for lecturer accounts");
    }
    if (!target.authId) {
      throw new ProvisioningError("This lecturer does not have a linked Supabase account");
    }

    const temporaryPassword = createTemporaryPassword();
    await setMustChangePassword(target.id, true);

    const { error } = await getAdminClient().auth.admin.updateUserById(target.authId, {
      password: temporaryPassword,
    });
    if (error) {
      // Cross-system transactions are impossible; rollback the gate when the
      // credential was not changed. If this rollback fails, it fails closed.
      await setMustChangePassword(target.id, false).catch(() => undefined);
      throw new ProvisioningError(error.message);
    }

    await recordSecurityAudit("TemporaryPasswordSet", actorUserId, target.id);
    return { userId: target.id, email: target.email, temporaryPassword };
  },

  /** Change only the authenticated caller's Supabase credential, then clear the forced-change gate. */
  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, authId: true },
    });
    if (!user?.authId) {
      throw new ProvisioningError("This account is not linked to Supabase authentication");
    }

    const { error } = await getAdminClient().auth.admin.updateUserById(user.authId, {
      password: input.password,
    });
    if (error) throw new ProvisioningError(error.message);

    // If the DB update fails after Supabase succeeds, the account remains gated
    // and the user can retry — fail closed rather than accidentally bypassing recovery.
    await setMustChangePassword(user.id, false);
    await recordSecurityAudit("PasswordChanged", user.id, user.id);
    return this.me(user.id);
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

  async deleteAccountForUser(authId: string | null): Promise<void> {
    if (!authId) return;
    const admin = getAdminClient();
    const { error } = await admin.auth.admin.deleteUser(authId);
    if (error && error.status !== 404) {
      throw new ProvisioningError(error.message);
    }
  },
};

export type AuthService = typeof authService;
