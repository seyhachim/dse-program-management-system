import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "../src/core/db/prisma.ts";

type HttpResult = { status: number; body: unknown };

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function client(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function passwordSession(email: string, password: string): Promise<string> {
  const result = await client().auth.signInWithPassword({ email, password });
  if (result.error || !result.data.session?.access_token) throw result.error ?? new Error("Password session unavailable");
  return result.data.session.access_token;
}

async function magicSession(admin: SupabaseClient, email: string): Promise<string> {
  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (generated.error) throw generated.error;
  const hash = generated.data.properties?.hashed_token;
  if (!hash) throw new Error("Magic-link token hash unavailable");
  const verified = await client().auth.verifyOtp({ token_hash: hash, type: "email" });
  if (verified.error || !verified.data.session?.access_token) throw verified.error ?? new Error("Magic-link session unavailable");
  return verified.data.session.access_token;
}

async function request(baseUrl: string, path: string, token: string, init: RequestInit = {}): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}

async function expectStatus(name: string, actual: HttpResult, expected: number): Promise<void> {
  if (actual.status !== expected) throw new Error(`${name}: expected ${expected}, got ${actual.status}`);
  console.log(`[uat-1141] case=${name} status=${actual.status} pass=yes`);
}

function meId(body: unknown): string | undefined {
  return body && typeof body === "object" && "id" in body ? String((body as { id?: unknown }).id ?? "") : undefined;
}

function portalStudentId(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("student" in body)) return undefined;
  const student = (body as { student?: unknown }).student;
  return student && typeof student === "object" && "id" in student
    ? String((student as { id?: unknown }).id ?? "")
    : undefined;
}

export async function runGoogle1141HostedUat(): Promise<void> {
  if (process.env.AUTH_UAT_1141 !== "1") return;

  const admin = client();
  const baseUrl = `http://127.0.0.1:${Number(process.env.PORT ?? 4000)}`;
  const suffix = Date.now().toString(36);
  const cleanupAuthIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupStudentIds: string[] = [];
  let createdReadPermissionId: string | undefined;
  let createdStudentPermissionMapping = false;

  const baseline = await Promise.all([
    prisma.enrollment.count(),
    prisma.assessmentResult.count(),
    prisma.qaEvidence.count(),
  ]);

  try {
    const [target, operator, roles] = await Promise.all([
      prisma.user.findFirst({
        where: { name: "UAT 1141 Google Student" },
        select: {
          id: true,
          authId: true,
          email: true,
          studentProfile: { select: { id: true, studentId: true, userId: true } },
        },
      }),
      prisma.user.findFirst({
        where: { name: "UAT 1141 Independent Operator" },
        select: { id: true, authId: true, email: true },
      }),
      prisma.role.findMany({
        where: { slug: { in: ["student", "admin", "lecturer"] } },
        select: { id: true, slug: true },
      }),
    ]);
    if (!target?.authId || !target.email || !target.studentProfile?.id) throw new Error("Approved disposable Google target fixture is missing");
    if (!operator?.authId || !operator.email) throw new Error("Independent disposable operator fixture is missing");
    const roleId = (slug: string) => {
      const role = roles.find((item) => item.slug === slug);
      if (!role) throw new Error(`Missing ${slug} role`);
      return role.id;
    };

    const targetAuth = await admin.auth.admin.getUserById(target.authId);
    if (targetAuth.error || !targetAuth.data.user) throw targetAuth.error ?? new Error("Target hosted Auth identity missing");
    const google = (targetAuth.data.user.identities ?? []).filter((identity) => identity.provider === "google" && identity.id);
    if (google.length !== 1 || !google[0]?.id) throw new Error("Target does not have exactly one current Google identity");

    const latestApproval = await prisma.$queryRaw<Array<{ action: string; google_identity_id: string }>>`
      SELECT action, google_identity_id
      FROM pms_auth_security.google_identity_approval_event
      WHERE user_id = ${target.id} AND auth_uid = ${target.authId}
      ORDER BY id DESC LIMIT 1`;
    if (latestApproval[0]?.action !== "approved" || latestApproval[0].google_identity_id !== google[0].id) {
      throw new Error("Expected exact active approval from the first hosted UAT stage");
    }

    // This disposable DB predates Student Portal permission seeding. Add only
    // the exact read permission needed for hosted portal isolation, before the
    // process-local permission cache is first populated, and remove it at end.
    let readPermission = await prisma.permission.findUnique({ where: { slug: "student-portal:read" } });
    if (!readPermission) {
      readPermission = await prisma.permission.create({
        data: {
          slug: "student-portal:read",
          title: "UAT Student Portal Read",
          description: "Disposable #1141 hosted UAT fixture",
        },
      });
      createdReadPermissionId = readPermission.id;
    }
    const existingMapping = await prisma.rolePermission.findUnique({
      where: {
        roleId_permissionId: {
          roleId: roleId("student"),
          permissionId: readPermission.id,
        },
      },
    });
    if (!existingMapping) {
      await prisma.rolePermission.create({
        data: { roleId: roleId("student"), permissionId: readPermission.id },
      });
      createdStudentPermissionMapping = true;
    }

    // Reset only the synthetic disposable operator credential so we can prove
    // fresh operator reauthentication without exposing or storing its password.
    const operatorPassword = `Oo8!${randomUUID()}-Pp6!`;
    const updatedOperator = await admin.auth.admin.updateUserById(operator.authId, { password: operatorPassword });
    if (updatedOperator.error) throw updatedOperator.error;
    const operatorToken = await passwordSession(operator.email, operatorPassword);
    const googleToken = await magicSession(admin, target.email);

    const approvedMe = await request(baseUrl, "/api/auth/me", googleToken);
    await expectStatus("approved-google-own-account", approvedMe, 200);
    if (meId(approvedMe.body) !== target.id) throw new Error("Google session resolved to wrong PMS User");

    const ownPortal = await request(baseUrl, "/api/student-portal/home", googleToken);
    await expectStatus("approved-google-own-portal", ownPortal, 200);
    if (portalStudentId(ownPortal.body) !== target.studentProfile.id) throw new Error("Google session resolved to wrong Student Portal profile");

    // Second synthetic password student tries to inject target studentId in the
    // query. The endpoint must still derive identity exclusively from req.user.
    const secondEmail = `uat-1141-${suffix}-second@example.invalid`;
    const secondPassword = `Ss7!${randomUUID()}-Tt5!`;
    const secondAuth = await admin.auth.admin.createUser({ email: secondEmail, password: secondPassword, email_confirm: true });
    if (secondAuth.error || !secondAuth.data.user) throw secondAuth.error ?? new Error("Second Auth user create failed");
    cleanupAuthIds.push(secondAuth.data.user.id);
    const secondUser = await prisma.user.create({
      data: { email: secondEmail, name: "UAT 1141 Second Student Continuation", authId: secondAuth.data.user.id },
    });
    cleanupUserIds.push(secondUser.id);
    await prisma.userRoleAssignment.create({
      data: { userId: secondUser.id, roleId: roleId("student"), programmeId: "dse" },
    });
    const secondStudent = await prisma.student.create({
      data: {
        name: "UAT 1141 Second Student Continuation",
        email: secondEmail,
        studentId: `UAT1141-S2-${suffix}`,
        status: "Active",
        userId: secondUser.id,
      },
    });
    cleanupStudentIds.push(secondStudent.id);
    const secondToken = await passwordSession(secondEmail, secondPassword);
    const spoofed = await request(
      baseUrl,
      `/api/student-portal/home?studentId=${encodeURIComponent(target.studentProfile.id)}`,
      secondToken,
    );
    await expectStatus("second-student-query-spoof-contained", spoofed, 200);
    if (portalStudentId(spoofed.body) !== secondStudent.id || portalStudentId(spoofed.body) === target.studentProfile.id) {
      throw new Error("Second student escaped its canonical Student identity");
    }

    // Staff promotion must invalidate Google immediately on the next request.
    await prisma.userRoleAssignment.create({
      data: { userId: target.id, roleId: roleId("lecturer"), programmeId: "dse" },
    });
    await expectStatus("staff-promotion-denies-google", await request(baseUrl, "/api/auth/me", googleToken), 403);
    await prisma.userRoleAssignment.delete({
      where: { userId_roleId: { userId: target.id, roleId: roleId("lecturer") } },
    });
    await expectStatus("student-role-restored-google", await request(baseUrl, "/api/auth/me", googleToken), 200);

    const approvalPayload = {
      targetUserId: target.id,
      authUid: target.authId,
      googleIdentityId: google[0].id,
      evidenceReference: `UAT1141R_${suffix}`,
      reason: "Disposable hosted Google revocation verification",
      adminPassword: operatorPassword,
      studentRecordVerified: true,
      directConsentVerified: true,
      providerOwnershipVerified: true,
    };
    await expectStatus(
      "google-revoke",
      await request(baseUrl, "/api/auth/google/revoke", operatorToken, {
        method: "POST",
        body: JSON.stringify(approvalPayload),
      }),
      201,
    );
    await expectStatus("revoked-google-fails-closed", await request(baseUrl, "/api/auth/me", googleToken), 403);

    await expectStatus(
      "consumed-intent-replay-denied",
      await request(baseUrl, "/api/auth/google/approve", operatorToken, {
        method: "POST",
        body: JSON.stringify({ ...approvalPayload, reason: "Disposable replay denial verification" }),
      }),
      409,
    );

    const [targetAfter, studentAfter, academicAfter] = await Promise.all([
      prisma.user.findUnique({ where: { id: target.id }, select: { id: true, authId: true } }),
      prisma.student.findUnique({ where: { id: target.studentProfile.id }, select: { id: true, userId: true } }),
      Promise.all([prisma.enrollment.count(), prisma.assessmentResult.count(), prisma.qaEvidence.count()]),
    ]);
    if (targetAfter?.id !== target.id || targetAfter.authId !== target.authId ||
        studentAfter?.id !== target.studentProfile.id || studentAfter.userId !== target.id) {
      throw new Error("Canonical User/Student identity changed during hosted UAT");
    }
    if (academicAfter.some((value, index) => value !== baseline[index])) {
      throw new Error("Academic or QA record counts changed during hosted UAT");
    }

    console.log("[uat-1141] case=canonical-user-student-stable pass=yes");
    console.log("[uat-1141] case=academic-qa-counts-stable pass=yes");
    console.log("[uat-1141] PASS hosted Google/PMS authorization boundary");
  } finally {
    if (cleanupStudentIds.length) {
      await prisma.student.deleteMany({ where: { id: { in: cleanupStudentIds } } }).catch(() => undefined);
    }
    if (cleanupUserIds.length) {
      await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: cleanupUserIds } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } }).catch(() => undefined);
    }
    for (const id of cleanupAuthIds) await admin.auth.admin.deleteUser(id).catch(() => undefined);

    if (createdStudentPermissionMapping && createdReadPermissionId) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: rolesafe("student"), permissionId: createdReadPermissionId },
      }).catch(() => undefined);
    }
    if (createdReadPermissionId) {
      await prisma.permission.deleteMany({ where: { id: createdReadPermissionId } }).catch(() => undefined);
    }
  }

  function rolesafe(slug: string): string {
    // Cleanup helper deliberately resolves the seeded role without logging IDs.
    // It is only reached after the test body initialized roles.
    return slug === "student"
      ? (process.env.UAT_STUDENT_ROLE_ID ?? "")
      : "";
  }
}
