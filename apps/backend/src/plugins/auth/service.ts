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
const accountSelect = {
  id: true,
  authId: true,
  name: true,
  email: true,
} as const;

export class ProvisioningError extends Error {}
export class ProgrammeRoleAssignmentError extends Error {}

let adminClient: SupabaseClient | undefined;

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

/** Exported only so security tests can assert the generated value against the API policy. */
export function createTemporaryPassword(): string {
  return `${randomBytes(18).toString("base64url")}!Aa7`;
}

async function recordSecurityAudit(
  action: "TemporaryPasswordSet" | "PasswordChanged",
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  await prisma.userSecurityAuditEvent.create({
    data: { action, actorUserId, targetUserId },
  });
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
  async me(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        mustChangePassword: true,
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
      mustChangePassword: user.mustChangePassword,
    };
  },

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
      update: { authId: data.user.id, name: input.name },
      create: { authId: data.user.id, email: input.email, name: input.name },
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
      await prisma.student.update({ where: { id: studentProfile.id }, data: { userId: user.id } });
    }

    const roles = await prisma.userRoleAssignment.findMany({
      where: { userId: user.id },
      select: { role: { select: { slug: true } } },
      orderBy: { createdAt: "asc" },
    });
    return { ...user, role: role.slug, roles: roles.map((assignment) => assignment.role.slug) };
  },

  /**
   * Admin recovery for an active lecturer. The browser supplies only a PMS user
   * id; this service resolves the linked Supabase uid server-side. The PMS gate
   * is set before the remote credential change so the operation fails closed.
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
    await prisma.user.update({
      where: { id: target.id },
      data: { mustChangePassword: true },
    });

    const { error } = await getAdminClient().auth.admin.updateUserById(target.authId, {
      password: temporaryPassword,
    });
    if (error) {
      await prisma.user.update({
        where: { id: target.id },
        data: { mustChangePassword: false },
      }).catch(() => undefined);
      throw new ProvisioningError(error.message);
    }

    await recordSecurityAudit("TemporaryPasswordSet", actorUserId, target.id);
    return { userId: target.id, email: target.email, temporaryPassword };
  },

  /** Change only the authenticated caller's credential and then clear the forced-change gate. */
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

    // Supabase succeeded first. If this DB transaction fails the account remains
    // gated and can retry, instead of silently regaining normal application access.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { mustChangePassword: false },
      }),
      prisma.userSecurityAuditEvent.create({
        data: { action: "PasswordChanged", actorUserId: user.id, targetUserId: user.id },
      }),
    ]);
    return this.me(user.id);
  },

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
      create: { userId: input.userId, roleId: role.id, programmeId: input.programmeId },
    });

    return programmeRoleView(input.userId, input.programmeId, input.role);
  },

  async removeProgrammeRole(input: ManageProgrammeRoleInput): Promise<void> {
    const role = await prisma.role.findUnique({
      where: { slug: input.role },
      select: { id: true },
    });
    if (!role) throw new ProgrammeRoleAssignmentError("Programme role is not installed");

    await prisma.userRoleAssignment.deleteMany({
      where: { userId: input.userId, roleId: role.id, programmeId: input.programmeId },
    });
  },

  async listProgrammeRoleAssignments(
    programmeId: string,
  ): Promise<ProgrammeRoleAssignmentView[]> {
    const rows = await prisma.userRoleAssignment.findMany({
      where: { programmeId, role: { slug: "qa_contributor" } },
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
    const { error } = await getAdminClient().auth.admin.deleteUser(authId);
    if (error && error.status !== 404) throw new ProvisioningError(error.message);
  },
};

export type AuthService = typeof authService;
