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
  if (result.error || !result.data.session?.access_token) {
    throw result.error ?? new Error("Password session unavailable");
  }
  return result.data.session.access_token;
}

async function magicSession(admin: SupabaseClient, email: string): Promise<string> {
  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (generated.error) throw generated.error;
  const hash = generated.data.properties?.hashed_token;
  if (!hash) throw new Error("Magic-link token hash unavailable");
  const verified = await client().auth.verifyOtp({ token_hash: hash, type: "email" });
  if (verified.error || !verified.data.session?.access_token) {
    throw verified.error ?? new Error("Magic-link session unavailable");
  }
  return verified.data.session.access_token;
}

async function request(
  baseUrl: string,
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<HttpResult> {
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

function bodyId(body: unknown): string | undefined {
  return body && typeof body === "object" && "id" in body
    ? String((body as { id?: unknown }).id ?? "")
    : undefined;
}

function homeStudentId(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("student" in body)) return undefined;
  const student = (body as { student?: unknown }).student;
  return student && typeof student === "object" && "id" in student
    ? String((student as { id?: unknown }).id ?? "")
    : undefined;
}

async function createPasswordAuth(
  admin: SupabaseClient,
  prefix: string,
  label: string,
): Promise<{ id: string; email: string; password: string; token: string }> {
  const email = `${prefix}-${label}@example.invalid`;
  const password = `Aa7!${randomUUID()}-Zz9!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Auth user create failed");
  return {
    id: created.data.user.id,
    email,
    password,
    token: await passwordSession(email, password),
  };
}

async function expectStatus(name: string, actual: HttpResult, expected: number): Promise<void> {
  if (actual.status !== expected) throw new Error(`${name}: expected ${expected}, got ${actual.status}`);
  console.log(`[uat-1141] case=${name} status=${actual.status} pass=yes`);
}

export async function runGoogle1141HostedUat(): Promise<void> {
  if (process.env.AUTH_UAT_1141 !== "1") return;

  const admin = client();
  const baseUrl = `http://127.0.0.1:${Number(process.env.PORT ?? 4000)}`;
  const prefix = `uat-1141-${Date.now().toString(36)}`;
  const cleanupAuthIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupStudentIds: string[] = [];
  let auditCreated = false;
  let targetUserId: string | undefined;
  let targetStudentId: string | undefined;
  let adminUserId: string | undefined;

  const baseline = await Promise.all([
    prisma.enrollment.count(),
    prisma.assessmentResult.count(),
    prisma.qaEvidence.count(),
  ]);

  try {
    const roles = await prisma.role.findMany({
      where: { slug: { in: ["student", "admin", "lecturer"] } },
      select: { id: true, slug: true },
    });
    const roleId = (slug: string) => {
      const role = roles.find((item) => item.slug === slug);
      if (!role) throw new Error(`Missing ${slug} role`);
      return role.id;
    };

    // A. Exercise the real password + explicit-consent endpoint before any
    // Google identity is attached.
    const consentAuth = await createPasswordAuth(admin, prefix, "consent-student");
    cleanupAuthIds.push(consentAuth.id);
    const consentUser = await prisma.user.create({
      data: { email: consentAuth.email, name: "UAT 1141 Consent Student", authId: consentAuth.id },
    });
    cleanupUserIds.push(consentUser.id);
    await prisma.userRoleAssignment.create({
      data: { userId: consentUser.id, roleId: roleId("student"), programmeId: "dse" },
    });
    const consentStudent = await prisma.student.create({
      data: {
        name: "UAT 1141 Consent Student",
        email: consentAuth.email,
        studentId: `UAT1141-C-${Date.now().toString(36)}`,
        status: "Active",
        userId: consentUser.id,
      },
    });
    cleanupStudentIds.push(consentStudent.id);

    const linkIntent = await request(baseUrl, "/api/auth/google/link-intent", consentAuth.token, {
      method: "POST",
      body: JSON.stringify({ password: consentAuth.password, consent: true }),
    });
    await expectStatus("password-verified-link-intent", linkIntent, 201);
    const intentRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count
      FROM pms_auth_security.google_link_intent
      WHERE user_id = ${consentUser.id} AND auth_uid = ${consentAuth.id}
        AND consumed_at IS NULL AND expires_at > clock_timestamp()`;
    if (Number(intentRows[0]?.count ?? 0) !== 1) {
      throw new Error("link-intent was not stored as one live server-attested consent");
    }

    // B. Find the pre-existing disposable Auth fixture that has both email and
    // Google. Never log its email, UID, or provider identity ID.
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (listed.error) throw listed.error;
    let googleAuth: { id: string; email: string; googleIdentityId: string } | null = null;
    for (const candidate of listed.data.users) {
      const detail = await admin.auth.admin.getUserById(candidate.id);
      if (detail.error || !detail.data.user?.email) continue;
      const identities = detail.data.user.identities ?? [];
      const emailIdentity = identities.find((item) => item.provider === "email");
      const googleIdentities = identities.filter((item) => item.provider === "google" && item.id);
      if (emailIdentity && googleIdentities.length === 1 && googleIdentities[0]!.id) {
        googleAuth = {
          id: detail.data.user.id,
          email: detail.data.user.email,
          googleIdentityId: googleIdentities[0]!.id!,
        };
        break;
      }
    }
    if (!googleAuth) throw new Error("No disposable hosted email+Google identity fixture is available");

    const existingPms = await prisma.user.findFirst({
      where: { OR: [{ authId: googleAuth.id }, { email: googleAuth.email }] },
      select: { id: true },
    });
    if (existingPms) throw new Error("Disposable Google Auth fixture is already bound to a PMS User");

    const target = await prisma.user.create({
      data: { email: googleAuth.email, name: "UAT 1141 Google Student", authId: googleAuth.id },
    });
    targetUserId = target.id;
    await prisma.userRoleAssignment.create({
      data: { userId: target.id, roleId: roleId("student"), programmeId: "dse" },
    });
    const targetStudent = await prisma.student.create({
      data: {
        name: "UAT 1141 Google Student",
        email: googleAuth.email,
        studentId: `UAT1141-G-${Date.now().toString(36)}`,
        status: "Active",
        userId: target.id,
      },
    });
    targetStudentId = targetStudent.id;
    const googleToken = await magicSession(admin, googleAuth.email);

    await expectStatus("unapproved-google-fails-closed", await request(baseUrl, "/api/auth/me", googleToken), 403);

    // C. Create an independent synthetic global admin with a real hosted
    // password session.
    const operatorAuth = await createPasswordAuth(admin, prefix, "operator");
    adminUserId = (await prisma.user.create({
      data: { email: operatorAuth.email, name: "UAT 1141 Independent Operator", authId: operatorAuth.id },
    })).id;
    await prisma.userRoleAssignment.create({
      data: { userId: adminUserId, roleId: roleId("admin"), programmeId: null },
    });

    // The existing Google fixture was linked before this run, so it cannot use
    // the pre-link consent endpoint now. Insert one synthetic, short-lived UAT
    // intent directly after separately proving the real consent endpoint above.
    // This is test scaffolding only and is explicitly recorded as such.
    const scaffoldIntentId = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await prisma.$executeRaw`
      INSERT INTO pms_auth_security.google_link_intent (id, user_id, auth_uid, expires_at)
      VALUES (${scaffoldIntentId}, ${target.id}, ${googleAuth.id}, ${expiresAt})`;
    console.log("[uat-1141] consent-scaffold=direct-disposable-test-only");

    const approval = {
      targetUserId: target.id,
      authUid: googleAuth.id,
      googleIdentityId: googleAuth.googleIdentityId,
      evidenceReference: `UAT1141_${Date.now().toString(36)}`,
      reason: "Disposable hosted Google approval boundary verification",
      adminPassword: operatorAuth.password,
      studentRecordVerified: true,
      directConsentVerified: true,
      providerOwnershipVerified: true,
    };

    await expectStatus(
      "wrong-google-identity-denied",
      await request(baseUrl, "/api/auth/google/approve", operatorAuth.token, {
        method: "POST",
        body: JSON.stringify({ ...approval, googleIdentityId: "wrong-google-identity" }),
      }),
      409,
    );

    await expectStatus(
      "exact-google-approval",
      await request(baseUrl, "/api/auth/google/approve", operatorAuth.token, {
        method: "POST",
        body: JSON.stringify(approval),
      }),
      201,
    );
    auditCreated = true;

    const approvedMe = await request(baseUrl, "/api/auth/me", googleToken);
    await expectStatus("approved-google-own-account", approvedMe, 200);
    if (bodyId(approvedMe.body) !== target.id) throw new Error("Approved Google session resolved to the wrong PMS User");

    const portal = await request(baseUrl, "/api/student-portal/home", googleToken);
    await expectStatus("approved-google-own-portal", portal, 200);
    if (homeStudentId(portal.body) !== targetStudent.id) {
      throw new Error("Approved Google session resolved to the wrong Student Portal record");
    }

    // D. A second synthetic student cannot select the approved student's
    // identity by adding a studentId query parameter.
    const secondAuth = await createPasswordAuth(admin, prefix, "second-student");
    cleanupAuthIds.push(secondAuth.id);
    const secondUser = await prisma.user.create({
      data: { email: secondAuth.email, name: "UAT 1141 Second Student", authId: secondAuth.id },
    });
    cleanupUserIds.push(secondUser.id);
    await prisma.userRoleAssignment.create({
      data: { userId: secondUser.id, roleId: roleId("student"), programmeId: "dse" },
    });
    const secondStudent = await prisma.student.create({
      data: {
        name: "UAT 1141 Second Student",
        email: secondAuth.email,
        studentId: `UAT1141-S-${Date.now().toString(36)}`,
        status: "Active",
        userId: secondUser.id,
      },
    });
    cleanupStudentIds.push(secondStudent.id);
    const spoofed = await request(
      baseUrl,
      `/api/student-portal/home?studentId=${encodeURIComponent(targetStudent.id)}`,
      secondAuth.token,
    );
    await expectStatus("second-student-query-spoof-contained", spoofed, 200);
    if (homeStudentId(spoofed.body) !== secondStudent.id || homeStudentId(spoofed.body) === targetStudent.id) {
      throw new Error("Second student session escaped its canonical Student identity");
    }

    // E. Staff promotion invalidates the student-only Google pilot immediately.
    await prisma.userRoleAssignment.create({
      data: { userId: target.id, roleId: roleId("lecturer"), programmeId: "dse" },
    });
    await expectStatus("staff-promotion-denies-google", await request(baseUrl, "/api/auth/me", googleToken), 403);
    await prisma.userRoleAssignment.delete({
      where: { userId_roleId: { userId: target.id, roleId: roleId("lecturer") } },
    });
    await expectStatus("student-role-restored-google", await request(baseUrl, "/api/auth/me", googleToken), 200);

    // F. Revocation is append-only and takes effect on the next request.
    await expectStatus(
      "google-revoke",
      await request(baseUrl, "/api/auth/google/revoke", operatorAuth.token, {
        method: "POST",
        body: JSON.stringify({ ...approval, reason: "Disposable hosted Google revocation verification" }),
      }),
      201,
    );
    await expectStatus("revoked-google-fails-closed", await request(baseUrl, "/api/auth/me", googleToken), 403);
    await expectStatus(
      "consumed-intent-replay-denied",
      await request(baseUrl, "/api/auth/google/approve", operatorAuth.token, {
        method: "POST",
        body: JSON.stringify(approval),
      }),
      409,
    );

    // G. Canonical identity and academic/QA records remain stable.
    const [afterTarget, afterStudent, academicAfter] = await Promise.all([
      prisma.user.findUnique({ where: { id: target.id }, select: { id: true, authId: true } }),
      prisma.student.findUnique({ where: { id: targetStudent.id }, select: { id: true, userId: true } }),
      Promise.all([prisma.enrollment.count(), prisma.assessmentResult.count(), prisma.qaEvidence.count()]),
    ]);
    if (afterTarget?.id !== target.id || afterTarget.authId !== googleAuth.id ||
        afterStudent?.id !== targetStudent.id || afterStudent.userId !== target.id) {
      throw new Error("Canonical PMS User/Student identity changed during Google UAT");
    }
    if (academicAfter.some((value, index) => value !== baseline[index])) {
      throw new Error("Academic or QA record counts changed during Google UAT");
    }

    console.log("[uat-1141] PASS hosted Google/PMS authorization boundary");
    console.log("[uat-1141] immutable-audit-fixtures=preserved-in-disposable-test-db");
  } finally {
    // The consent-only and second-student fixtures are not referenced by the
    // append-only Google audit history and can be removed. The approved/revoked
    // target + operator must remain because the restricted audit tables use
    // RESTRICT FKs by design.
    if (cleanupStudentIds.length) {
      await prisma.student.deleteMany({ where: { id: { in: cleanupStudentIds } } }).catch(() => undefined);
    }
    if (cleanupUserIds.length) {
      await prisma.$executeRaw`
        DELETE FROM pms_auth_security.google_link_intent
        WHERE user_id IN (${cleanupUserIds[0] ?? ""}, ${cleanupUserIds[1] ?? ""})`.catch(() => undefined);
      await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: cleanupUserIds } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } }).catch(() => undefined);
    }
    for (const id of cleanupAuthIds) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }

    if (!auditCreated) {
      if (targetStudentId) await prisma.student.deleteMany({ where: { id: targetStudentId } }).catch(() => undefined);
      if (targetUserId) {
        await prisma.userRoleAssignment.deleteMany({ where: { userId: targetUserId } }).catch(() => undefined);
        await prisma.$executeRaw`DELETE FROM pms_auth_security.google_link_intent WHERE user_id = ${targetUserId}`.catch(() => undefined);
        await prisma.user.deleteMany({ where: { id: targetUserId } }).catch(() => undefined);
      }
      if (adminUserId) {
        await prisma.userRoleAssignment.deleteMany({ where: { userId: adminUserId } }).catch(() => undefined);
        await prisma.user.deleteMany({ where: { id: adminUserId } }).catch(() => undefined);
      }
    }
  }
}
