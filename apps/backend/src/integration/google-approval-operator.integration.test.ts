import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  GoogleApprovalError,
  approveGoogleIdentity,
  getApprovedGoogleIdentity,
  recordGoogleLinkIntent,
  revokeGoogleIdentity,
} from "../core/auth/google-approval-store.ts";
import type { AuthUser } from "../core/auth/token.ts";
import { prisma } from "../core/db/prisma.ts";

/** Real disposable PostgreSQL + local mocked Supabase Auth; no production credentials. */
const integrationDescribe = process.env.BACKEND_INTEGRATION_TESTS === "1" ? describe : describe.skip;

integrationDescribe("Google student consent and independent audited operator approval", () => {
  const uid = "00000000-0000-4000-8000-000000000301";
  const operatorUid = "00000000-0000-4000-8000-000000000302";
  const googleId = "ci-google-auth-identity-operator";
  const studentPassword = "CI-student-existing-password";
  const adminPassword = "CI-admin-existing-password";
  let student: AuthUser;
  let operator: AuthUser;
  let originalStudentUid: string | null;
  let originalOperatorUid: string | null;
  let googleLinked = false;
  let server: Server;
  const oldEnv = {
    AUTH_MODE: process.env.AUTH_MODE,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOOGLE_OAUTH_APPROVAL_ENABLED: process.env.GOOGLE_OAUTH_APPROVAL_ENABLED,
  };

  const input = () => ({
    targetUserId: student.id,
    authUid: uid,
    googleIdentityId: googleId,
    evidenceReference: "CI-OPERATOR-VERIFY-01",
    reason: "Independent synthetic student and provider verification",
    adminPassword,
  });

  beforeAll(async () => {
    const [studentUser, adminUser] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: "student@dse.dev" }, select: { id: true, authId: true } }),
      prisma.user.findUniqueOrThrow({ where: { email: "admin@dse.dev" }, select: { id: true, authId: true } }),
    ]);
    originalStudentUid = studentUser.authId;
    originalOperatorUid = adminUser.authId;
    student = {
      id: studentUser.id, email: "student@dse.dev", roles: ["student"],
      programmeRoles: [{ role: "student", programmeId: "dse" }],
    };
    operator = {
      id: adminUser.id, email: "admin@dse.dev", roles: ["admin"],
      programmeRoles: [{ role: "admin", programmeId: null }],
    };
    await prisma.user.update({ where: { id: student.id }, data: { authId: uid } });
    await prisma.user.update({ where: { id: operator.id }, data: { authId: operatorUid } });
    server = createServer(async (req, res) => {
      res.setHeader("content-type", "application/json");
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname.startsWith("/auth/v1/admin/users/")) {
        const authUid = url.pathname.split("/").at(-1);
        if (authUid !== uid && authUid !== operatorUid) {
          res.writeHead(404);
          res.end(JSON.stringify({ message: "No account" }));
          return;
        }
        const email = authUid === uid ? student.email : operator.email;
        const identities = [{ id: `ci-email-${authUid}`, provider: "email" }];
        if (authUid === uid && googleLinked) identities.push({ id: googleId, provider: "google" });
        res.end(JSON.stringify({ id: authUid, email, email_confirmed_at: "2026-09-16T00:00:00Z", identities }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/auth/v1/token") {
        let body = "";
        for await (const chunk of req) body += String(chunk);
        let credentials: { email?: string; password?: string } = {};
        try { credentials = JSON.parse(body) as typeof credentials; } catch { /* fail below */ }
        const validStudent = credentials.email === student.email && credentials.password === studentPassword;
        const validAdmin = credentials.email === operator.email && credentials.password === adminPassword;
        if (!validStudent && !validAdmin) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials", message: "Invalid login credentials" }));
          return;
        }
        const id = validStudent ? uid : operatorUid;
        const email = validStudent ? student.email : operator.email;
        res.end(JSON.stringify({
          access_token: "ci-only-untrusted-token", token_type: "bearer", expires_in: 3600,
          refresh_token: "ci-only-untrusted-refresh-token",
          user: { id, email, aud: "authenticated", role: "authenticated", created_at: "2026-09-16T00:00:00Z",
            confirmed_at: "2026-09-16T00:00:00Z", email_confirmed_at: "2026-09-16T00:00:00Z",
            app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {} },
        }));
        return;
      }
      res.writeHead(404);
      res.end(JSON.stringify({ message: "Unknown Auth endpoint" }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    process.env.AUTH_MODE = "supabase";
    process.env.GOOGLE_OAUTH_APPROVAL_ENABLED = "true";
    process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "ci-only-service-role-placeholder";
  });

  afterAll(async () => {
    if (student?.id) await prisma.user.update({ where: { id: student.id }, data: { authId: originalStudentUid } });
    if (operator?.id) await prisma.user.update({ where: { id: operator.id }, data: { authId: originalOperatorUid } });
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  });

  test("wrong password or a staff session cannot mint student consent", async () => {
    await expect(recordGoogleLinkIntent(student, "wrong-password"))
      .rejects.toBeInstanceOf(GoogleApprovalError);
    await expect(recordGoogleLinkIntent(operator, adminPassword))
      .rejects.toBeInstanceOf(GoogleApprovalError);
    expect(await getApprovedGoogleIdentity(uid, student.id)).toBeNull();
  });

  test("fresh existing student password creates a time-limited consent intent", async () => {
    const result = await recordGoogleLinkIntent(student, studentPassword);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM pms_auth_security.google_link_intent
      WHERE user_id = ${student.id} AND auth_uid = ${uid} AND consumed_at IS NULL`;
    expect(rows).toHaveLength(1);
  });

  test("independent admin proves password and exact linked Google identity before approving", async () => {
    googleLinked = true;
    await expect(approveGoogleIdentity(operator, { ...input(), adminPassword: "wrong-password" }))
      .rejects.toBeInstanceOf(GoogleApprovalError);
    await expect(approveGoogleIdentity(student, input()))
      .rejects.toBeInstanceOf(GoogleApprovalError);
    await expect(approveGoogleIdentity(operator, { ...input(), googleIdentityId: "ci-different-provider-id" }))
      .rejects.toBeInstanceOf(GoogleApprovalError);
    expect(await getApprovedGoogleIdentity(uid, student.id)).toBeNull();
    await approveGoogleIdentity(operator, input());
    expect(await getApprovedGoogleIdentity(uid, student.id)).toBe(googleId);
    await expect(approveGoogleIdentity(operator, input())).rejects.toBeInstanceOf(GoogleApprovalError);
  });

  test("revocation appends to immutable history, applies immediately, and prevents consumed-intent replay", async () => {
    await revokeGoogleIdentity(operator, input());
    expect(await getApprovedGoogleIdentity(uid, student.id)).toBeNull();
    await expect(approveGoogleIdentity(operator, input())).rejects.toBeInstanceOf(GoogleApprovalError);
    const events = await prisma.$queryRaw<Array<{ action: string }>>`
      SELECT action FROM pms_auth_security.google_identity_approval_event
      WHERE auth_uid = ${uid} ORDER BY id DESC`;
    expect(events.map((row) => row.action)).toEqual(["revoked", "approved"]);
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: student.id }, select: { authId: true } });
    expect(unchanged.authId).toBe(uid);
  });
});
