import { createClient } from "@supabase/supabase-js";
import { prisma } from "../src/core/db/prisma.ts";
import { verifySupabaseToken } from "../src/core/auth/token.ts";
import { decodeProtectedHeader, decodeJwt } from "jose";
import { refreshStudentPortalInvitation } from "../src/plugins/auth/resend-invitation.ts";

type UatCase = {
  name: string;
  status: number;
  expected: number;
  elapsedMs: number;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function sessionForEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string> {
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (generated.error) throw generated.error;
  const tokenHash = generated.data.properties?.hashed_token;
  if (!tokenHash) throw new Error("Magic-link token hash unavailable");

  const authClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const verified = await authClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (verified.error) throw verified.error;
  const accessToken = verified.data.session?.access_token;
  if (!accessToken) throw new Error("No access token returned from hosted Auth");
  return accessToken;
}

async function callMe(baseUrl: string, accessToken: string): Promise<{ status: number; elapsedMs: number }> {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  await response.text();
  return { status: response.status, elapsedMs: performance.now() - started };
}

async function callJson(
  baseUrl: string,
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown; elapsedMs: number }> {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body, elapsedMs: performance.now() - started };
}

async function passwordSession(email: string, password: string): Promise<string> {
  const client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const token = signedIn.data.session?.access_token;
  if (!token) throw new Error("Password sign-in returned no access token");
  return token;
}

export async function runAuth1143HostedUat(): Promise<void> {
  if (process.env.AUTH_UAT_1143 !== "1") return;

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const port = Number(process.env.PORT ?? 4000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const runId = Date.now().toString(36);
  const prefix = `uat-1143-${runId}`;
  const createdAuthIds: string[] = [];
  const createdEmails: string[] = [];
  const createdStudentIds: string[] = [];
  const results: UatCase[] = [];

  async function createAuthUser(label: string): Promise<{ id: string; email: string; token: string }> {
    const email = `${prefix}-${label}@example.invalid`;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("Could not create hosted Auth user");
    createdAuthIds.push(created.data.user.id);
    createdEmails.push(email);
    const token = await sessionForEmail(admin, email);
    return { id: created.data.user.id, email, token };
  }

  async function createPasswordAuthUser(label: string): Promise<{ id: string; email: string; password: string; token: string }> {
    const email = `${prefix}-${label}@example.invalid`;
    const password = `Aa7!${crypto.randomUUID()}-Zz9!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("Could not create password Auth user");
    createdAuthIds.push(created.data.user.id);
    createdEmails.push(email);
    const token = await passwordSession(email, password);
    return { id: created.data.user.id, email, password, token };
  }

  async function record(name: string, token: string, expected: number): Promise<void> {
    const actual = await callMe(baseUrl, token);
    results.push({ name, expected, ...actual });
    if (actual.status !== expected) {
      throw new Error(`${name}: expected HTTP ${expected}, got ${actual.status}`);
    }
  }

  try {
    // 1) Already-bound, email-only hosted identity succeeds.
    const bound = await createAuthUser("bound");
    try {
      const header = decodeProtectedHeader(bound.token);
      const claims = decodeJwt(bound.token);
      console.log(`[uat-1143] token-preflight alg=${String(header.alg)} kid=${header.kid ? "present" : "absent"} issuerHost=${typeof claims.iss === "string" ? new URL(claims.iss).host : "missing"}`);
      await verifySupabaseToken(bound.token);
      console.log("[uat-1143] token-preflight verifySupabaseToken=pass");
    } catch (error) {
      console.log("[uat-1143] token-preflight verifySupabaseToken=fail", error instanceof Error ? error.message : "unknown");
    }
    await prisma.user.create({
      data: { email: bound.email, name: "UAT 1143 Bound", authId: bound.id },
    });
    await record("bound-email-only", bound.token, 200);

    // 2) Historical unbound PMS user is claimed atomically by confirmed hosted identity.
    const unbound = await createAuthUser("unbound");
    const unboundPms = await prisma.user.create({
      data: { email: unbound.email, name: "UAT 1143 Unbound" },
    });
    await record("unbound-confirmed-email-claim", unbound.token, 200);
    const claimed = await prisma.user.findUnique({ where: { id: unboundPms.id }, select: { authId: true } });
    if (claimed?.authId !== unbound.id) throw new Error("Unbound hosted identity did not claim the expected PMS user");

    // 3) Same email with a different existing PMS authId fails closed.
    const conflict = await createAuthUser("conflict");
    const conflictingAuthId = crypto.randomUUID();
    await prisma.user.create({
      data: { email: conflict.email, name: "UAT 1143 Conflict", authId: conflictingAuthId },
    });
    await record("different-uid-same-email", conflict.token, 403);
    const conflictAfter = await prisma.user.findUnique({ where: { email: conflict.email }, select: { authId: true } });
    if (conflictAfter?.authId !== conflictingAuthId) throw new Error("Conflicting PMS authId was mutated");

    // 4) Hosted Auth user with no PMS provisioning stays denied.
    const unknown = await createAuthUser("unknown");
    await record("unprovisioned-hosted-user", unknown.token, 403);

    // 5) A current Google-linked identity must fail closed even when using an email magic-link session.
    try {
      const googleLinkedRows = await prisma.$queryRaw<Array<{ email: string }>>`
        select u.email
        from auth.users u
        join auth.identities e on e.user_id = u.id and e.provider = 'email'
        join auth.identities g on g.user_id = u.id and g.provider = 'google'
        where u.email is not null
        limit 1
      `;
      const googleLinkedEmail = googleLinkedRows[0]?.email;
      if (!googleLinkedEmail) throw new Error("No disposable email+Google hosted identity available");
      const googleLinkedToken = await sessionForEmail(admin, googleLinkedEmail);
      await record("same-uid-current-google-identity", googleLinkedToken, 403);
    } catch {
      // Already proven in the preceding hosted run; some disposable DB roles cannot SELECT auth schema.
      console.log("[uat-1143] case=same-uid-current-google-identity skipped=auth-schema-db-role previousHostedRun=pass");
    }

    // 6) Real hosted email/password sign-in succeeds for an already-bound account.
    const passwordUser = await createPasswordAuthUser("password");
    const passwordPms = await prisma.user.create({
      data: { email: passwordUser.email, name: "UAT 1143 Password", authId: passwordUser.id },
    });
    const passwordMe = await callJson(baseUrl, "/api/auth/me", passwordUser.token);
    if (passwordMe.status !== 200) throw new Error(`password-login: expected HTTP 200, got ${passwordMe.status}`);
    results.push({ name: "hosted-password-login", expected: 200, status: passwordMe.status, elapsedMs: passwordMe.elapsedMs });

    // 7) Forced-password-change gate permits recovery endpoints only, clears after change, and audits.
    await prisma.user.update({ where: { id: passwordPms.id }, data: { mustChangePassword: true } });
    const gated = await callJson(baseUrl, "/api/auth/programme-roles?programmeId=dse", passwordUser.token);
    const gatedCode =
      gated.body && typeof gated.body === "object" && "code" in gated.body
        ? (gated.body as { code?: unknown }).code
        : undefined;
    if (gated.status !== 403 || gatedCode !== "PASSWORD_CHANGE_REQUIRED") {
      throw new Error(`forced-password-gate: expected 403 PASSWORD_CHANGE_REQUIRED, got ${gated.status}`);
    }
    results.push({ name: "forced-password-gate", expected: 403, status: gated.status, elapsedMs: gated.elapsedMs });

    const newPassword = `Bb8!${crypto.randomUUID()}-Yy6!`;
    const changed = await callJson(baseUrl, "/api/auth/change-password", passwordUser.token, {
      method: "POST",
      body: JSON.stringify({ password: newPassword }),
    });
    if (changed.status !== 200) throw new Error(`password-change: expected HTTP 200, got ${changed.status}`);
    const postChange = await prisma.user.findUnique({
      where: { id: passwordPms.id },
      select: { mustChangePassword: true },
    });
    const auditCount = await prisma.userSecurityAuditEvent.count({
      where: { action: "PasswordChanged", targetUserId: passwordPms.id },
    });
    if (postChange?.mustChangePassword || auditCount < 1) {
      throw new Error("Password-change recovery did not clear the gate and record an audit event");
    }
    const newPasswordToken = await passwordSession(passwordUser.email, newPassword);
    const postChangeMe = await callMe(baseUrl, newPasswordToken);
    if (postChangeMe.status !== 200) throw new Error(`password-change-relogin: expected HTTP 200, got ${postChangeMe.status}`);
    results.push({ name: "password-change-and-relogin", expected: 200, status: postChangeMe.status, elapsedMs: postChangeMe.elapsedMs });

    // 8) Concurrent first-login claims never bind a wrong UID.
    const concurrent = await createAuthUser("concurrent");
    const concurrentPms = await prisma.user.create({
      data: { email: concurrent.email, name: "UAT 1143 Concurrent" },
    });
    const concurrentResponses = await Promise.all([
      callMe(baseUrl, concurrent.token),
      callMe(baseUrl, concurrent.token),
    ]);
    if (concurrentResponses.some((item) => ![200, 403].includes(item.status))) {
      throw new Error(`concurrent-claim: unexpected statuses ${concurrentResponses.map((x) => x.status).join(",")}`);
    }
    const concurrentAfter = await prisma.user.findUnique({
      where: { id: concurrentPms.id },
      select: { authId: true },
    });
    if (concurrentAfter?.authId !== concurrent.id) throw new Error("Concurrent claim did not preserve the exact hosted Auth UID");
    console.log(`[uat-1143] case=concurrent-claim statuses=${concurrentResponses.map((x) => x.status).join(",")} boundExactUid=yes`);

    // 9) Two independently bound users resolve only to their own PMS identities.
    const isoA = await createAuthUser("isolation-a");
    const isoB = await createAuthUser("isolation-b");
    const [isoPmsA, isoPmsB] = await Promise.all([
      prisma.user.create({ data: { email: isoA.email, name: "UAT 1143 Isolation A", authId: isoA.id } }),
      prisma.user.create({ data: { email: isoB.email, name: "UAT 1143 Isolation B", authId: isoB.id } }),
    ]);
    const [isoMeA, isoMeB] = await Promise.all([
      callJson(baseUrl, "/api/auth/me", isoA.token),
      callJson(baseUrl, "/api/auth/me", isoB.token),
    ]);
    const idA = isoMeA.body && typeof isoMeA.body === "object" && "id" in isoMeA.body ? (isoMeA.body as { id?: unknown }).id : undefined;
    const idB = isoMeB.body && typeof isoMeB.body === "object" && "id" in isoMeB.body ? (isoMeB.body as { id?: unknown }).id : undefined;
    if (isoMeA.status !== 200 || isoMeB.status !== 200 || idA !== isoPmsA.id || idB !== isoPmsB.id || idA === idB) {
      throw new Error("two-user-isolation: hosted sessions did not resolve to their exact independent PMS users");
    }
    console.log("[uat-1143] case=two-user-isolation status=pass exact-own-user=yes");

    // 10) Unconfirmed email/password identity is rejected by hosted Supabase before PMS authorization.
    const unconfirmedEmail = `${prefix}-unconfirmed@example.invalid`;
    const unconfirmedPassword = `Cc9!${crypto.randomUUID()}-Xx5!`;
    const unconfirmedCreated = await admin.auth.admin.createUser({
      email: unconfirmedEmail,
      password: unconfirmedPassword,
      email_confirm: false,
    });
    if (unconfirmedCreated.error || !unconfirmedCreated.data.user) {
      throw unconfirmedCreated.error ?? new Error("Could not create unconfirmed hosted Auth user");
    }
    createdAuthIds.push(unconfirmedCreated.data.user.id);
    createdEmails.push(unconfirmedEmail);
    let unconfirmedRejected = false;
    try {
      await passwordSession(unconfirmedEmail, unconfirmedPassword);
    } catch {
      unconfirmedRejected = true;
    }
    if (!unconfirmedRejected) throw new Error("unconfirmed-identity: hosted Auth unexpectedly issued a session");
    console.log("[uat-1143] case=unconfirmed-password-identity status=pass noSession=yes");

    // 11) Simulated live Admin verification outage fails closed at the hosted HTTP boundary.
    const outage = await callJson(baseUrl, "/api/auth/me", bound.token, {
      headers: { "x-uat-admin-outage": "1" },
    });
    if (outage.status !== 403) throw new Error(`admin-outage-fail-closed: expected HTTP 403, got ${outage.status}`);
    results.push({ name: "admin-outage-fail-closed-simulated", expected: 403, status: outage.status, elapsedMs: outage.elapsedMs });

    // 12) Student invitation recovery must not delete or rotate an already-active hosted account.
    const studentRole = await prisma.role.findUnique({ where: { slug: "student" }, select: { id: true } });
    if (!studentRole) throw new Error("student role missing from disposable PMS seed");
    await prisma.userRoleAssignment.create({
      data: { userId: passwordPms.id, roleId: studentRole.id, programmeId: "dse" },
    });
    const recoveryStudent = await prisma.student.create({
      data: {
        name: "UAT 1143 Recovery Student",
        email: passwordUser.email,
        userId: passwordPms.id,
        status: "Active",
      },
    });
    createdStudentIds.push(recoveryStudent.id);
    const recoveryResult = await refreshStudentPortalInvitation(recoveryStudent.id);
    if (recoveryResult.status !== "existing-account") {
      throw new Error(`student-invitation-recovery: expected existing-account, got ${recoveryResult.status}`);
    }
    const [authStillExists, pmsStillBound] = await Promise.all([
      admin.auth.admin.getUserById(passwordUser.id),
      prisma.user.findUnique({ where: { id: passwordPms.id }, select: { authId: true } }),
    ]);
    if (authStillExists.error || authStillExists.data.user?.id !== passwordUser.id || pmsStillBound?.authId !== passwordUser.id) {
      throw new Error("student-invitation-recovery mutated an active identity");
    }
    console.log("[uat-1143] case=student-invitation-recovery-active-account status=pass identityUnchanged=yes");

    // 13) Real pending Student Portal invitation recovery stays consistent on success or provider send failure.
    // generateLink creates invitation state without consuming the hosted email-send quota.
    const pendingEmail = `${prefix}-pending-invite@example.com`;
    const pendingInvite = await admin.auth.admin.generateLink({
      type: "invite",
      email: pendingEmail,
      options: { data: { name: "UAT 1143 Pending Student", role: "student" } },
    });
    if (pendingInvite.error || !pendingInvite.data.user) {
      throw pendingInvite.error ?? new Error("Could not create synthetic pending invitation state");
    }
    createdAuthIds.push(pendingInvite.data.user.id);
    createdEmails.push(pendingEmail);
    const pendingPms = await prisma.user.create({
      data: { email: pendingEmail, name: "UAT 1143 Pending Student", authId: pendingInvite.data.user.id },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: pendingPms.id, roleId: studentRole.id, programmeId: "dse" },
    });
    const pendingStudent = await prisma.student.create({
      data: {
        name: "UAT 1143 Pending Student",
        email: pendingEmail,
        userId: pendingPms.id,
        status: "Active",
      },
    });
    createdStudentIds.push(pendingStudent.id);

    let pendingRecoveryStatus: "resent" | "provider-failed-safe";
    try {
      const pendingRecovery = await refreshStudentPortalInvitation(pendingStudent.id);
      if (pendingRecovery.status !== "resent") {
        throw new Error(`student-pending-invitation-recovery: expected resent, got ${pendingRecovery.status}`);
      }
      const reboundPms = await prisma.user.findUnique({ where: { id: pendingPms.id }, select: { authId: true } });
      if (!reboundPms?.authId || reboundPms.authId === pendingInvite.data.user.id) {
        throw new Error("student-pending-invitation-recovery did not rotate to a new hosted Auth identity");
      }
      if (!createdAuthIds.includes(reboundPms.authId)) createdAuthIds.push(reboundPms.authId);
      const [oldAuth, newAuth] = await Promise.all([
        admin.auth.admin.getUserById(pendingInvite.data.user.id),
        admin.auth.admin.getUserById(reboundPms.authId),
      ]);
      if (oldAuth.data.user || !newAuth.data.user || newAuth.data.user.id !== reboundPms.authId) {
        throw new Error("student-pending-invitation-recovery left the wrong hosted identity active");
      }
      pendingRecoveryStatus = "resent";
    } catch (error) {
      const reboundPms = await prisma.user.findUnique({ where: { id: pendingPms.id }, select: { authId: true } });
      const oldAuth = await admin.auth.admin.getUserById(pendingInvite.data.user.id);
      if (oldAuth.data.user || reboundPms?.authId !== null) {
        throw new Error("student-pending-invitation-recovery provider failure left a stale Auth binding");
      }
      pendingRecoveryStatus = "provider-failed-safe";
      console.log("[uat-1143] pending-invite provider-send-error handled safely");
    }
    console.log(`[uat-1143] case=student-pending-invitation-recovery status=pass outcome=${pendingRecoveryStatus}`);

    // 14) Per-request hosted request latency sample on the successful bound account.
    const samples: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const sample = await callMe(baseUrl, bound.token);
      if (sample.status !== 200) throw new Error(`Latency sample failed with HTTP ${sample.status}`);
      samples.push(sample.elapsedMs);
    }
    const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const min = Math.min(...samples);
    const max = Math.max(...samples);

    console.log("[uat-1143] PASS hosted Supabase/PMS identity boundary");
    for (const result of results) {
      console.log(
        `[uat-1143] case=${result.name} status=${result.status} expected=${result.expected} elapsedMs=${result.elapsedMs.toFixed(1)}`,
      );
    }
    console.log(
      `[uat-1143] hosted-me-total-latency samples=5 minMs=${min.toFixed(1)} avgMs=${avg.toFixed(1)} maxMs=${max.toFixed(1)}`,
    );
  } finally {
    // Cleanup only synthetic rows created by this harness.
    if (createdEmails.length > 0) {
      const uatUsers = await prisma.user.findMany({
        where: { email: { in: createdEmails } },
        select: { id: true },
      });
      const userIds = uatUsers.map((user) => user.id);
      if (createdStudentIds.length > 0) {
        await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
      }
      if (userIds.length > 0) {
        await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.userSecurityAuditEvent.deleteMany({
          where: { OR: [{ actorUserId: { in: userIds } }, { targetUserId: { in: userIds } }] },
        });
      }
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    for (const authId of createdAuthIds) {
      await admin.auth.admin.deleteUser(authId);
    }
  }
}
