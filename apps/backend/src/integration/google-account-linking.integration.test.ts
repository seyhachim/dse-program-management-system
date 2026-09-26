import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";

/** Disposable CI PostgreSQL and local mock Auth/JWKS only; NEVER production. */
const integrationDescribe = process.env.BACKEND_INTEGRATION_TESTS === "1" ? describe : describe.skip;

integrationDescribe("Google approval requires independently audited exact identity", () => {
  const uid = "00000000-0000-4000-8000-000000000201";
  const otherUid = "00000000-0000-4000-8000-000000000202";
  const googleIdentityId = "ci-google-provider-identity";
  const otherIdentityId = "ci-wrong-google-provider-identity";
  let userId: string;
  let operatorId: string;
  let originalAuthId: string | null;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
  let baseUrl: string;
  let jwksServer: Server | undefined;
  let adminServer: Server | undefined;
  let appServer: Server | undefined;
  let googleId: string | null = googleIdentityId;
  const oldEnv = {
    AUTH_MODE: process.env.AUTH_MODE,
    SUPABASE_JWKS_URL: process.env.SUPABASE_JWKS_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOOGLE_OAUTH_APPROVAL_ENABLED: process.env.GOOGLE_OAUTH_APPROVAL_ENABLED,
    GOOGLE_OAUTH_APPROVED_IDENTITIES: process.env.GOOGLE_OAUTH_APPROVED_IDENTITIES,
  };

  const tokenFor = (sub: string, provider = "email", providers: string[] = ["email"]) =>
    new SignJWT({ email: "student@dse.dev", app_metadata: { provider, providers } })
      .setProtectedHeader({ alg: "RS256", kid: "google-linking-ci" })
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

  const callMe = async (token: string) => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status, body: await response.json() as { id?: string; roles?: string[] } };
  };

  const callHome = async (token: string, claimedStudentId: string) => {
    const response = await fetch(`${baseUrl}/api/student-portal/home?studentId=${claimedStudentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status, body: await response.json() as { student?: { id: string } } };
  };

  async function appendDecision(action: "approved" | "revoked", googleIdentity: string): Promise<void> {
    const intentId = action === "approved" ? randomUUID() : null;
    if (intentId) {
      await prisma.$executeRaw`
        INSERT INTO pms_auth_security.google_link_intent (id, user_id, auth_uid, expires_at, consumed_at)
        VALUES (${intentId}, ${userId}, ${uid}, clock_timestamp() + interval '15 minutes', clock_timestamp())`;
    }
    await prisma.$executeRaw`
      INSERT INTO pms_auth_security.google_identity_approval_event
        (user_id, auth_uid, google_identity_id, action, actor_user_id, evidence_reference, reason, link_intent_id)
      VALUES (${userId}, ${uid}, ${googleIdentity}, ${action}, ${operatorId},
        'CI-TEST-TICKET', 'Independent synthetic test verification', ${intentId})`;
  }

  beforeAll(async () => {
    const student = await prisma.user.findUniqueOrThrow({
      where: { email: "student@dse.dev" }, select: { id: true, authId: true },
    });
    const operator = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@dse.dev" }, select: { id: true },
    });
    userId = student.id;
    operatorId = operator.id;
    originalAuthId = student.authId;
    // Only the isolated CI seed User is changed and is restored in afterAll.
    await prisma.user.update({ where: { id: userId }, data: { authId: uid } });

    const keys = await generateKeyPair("RS256");
    privateKey = keys.privateKey;
    const jwk = await exportJWK(keys.publicKey);
    jwk.kid = "google-linking-ci";
    jwk.alg = "RS256";
    jwk.use = "sig";
    jwksServer = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    jwksServer.listen(0, "127.0.0.1");
    await once(jwksServer, "listening");
    process.env.SUPABASE_JWKS_URL = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/auth/v1/.well-known/jwks.json`;

    adminServer = createServer((req, res) => {
      const suppliedUid = (req.url ?? "").split("/auth/v1/admin/users/")[1];
      res.setHeader("content-type", "application/json");
      if (suppliedUid !== uid) {
        res.writeHead(404);
        res.end(JSON.stringify({ message: "Unknown user" }));
        return;
      }
      const identities = [{ id: "ci-email-identity", provider: "email" }];
      if (googleId) identities.push({ id: googleId, provider: "google" });
      res.end(JSON.stringify({ id: uid, email: "student@dse.dev", email_confirmed_at: "2026-09-16T00:00:00Z", identities }));
    });
    adminServer.listen(0, "127.0.0.1");
    await once(adminServer, "listening");
    process.env.SUPABASE_URL = `http://127.0.0.1:${(adminServer.address() as AddressInfo).port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "ci-only-fake-service-role-key";
    process.env.AUTH_MODE = "supabase";
    process.env.GOOGLE_OAUTH_APPROVAL_ENABLED = "true";
    delete process.env.GOOGLE_OAUTH_APPROVED_IDENTITIES;
    appServer = createApp().listen(0, "127.0.0.1");
    await once(appServer, "listening");
    baseUrl = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (userId) await prisma.user.update({ where: { id: userId }, data: { authId: originalAuthId } });
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await Promise.all([appServer, adminServer, jwksServer].map((server) => new Promise<void>((resolve, reject) => {
      if (!server) return resolve();
      server.close((error) => error ? reject(error) : resolve());
    })));
    await prisma.$disconnect();
  });

  test("unapproved auto-linked verified Google with stale email-only JWT returns 403 and does not rewrite canonical IDs", async () => {
    const response = await callMe(await tokenFor(uid));
    expect(response.status).toBe(403);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { authId: true } }))
      .toEqual({ authId: uid });
  });

  test("wrong audited identity and even legacy environment allowlist never authorize", async () => {
    process.env.GOOGLE_OAUTH_APPROVED_IDENTITIES = JSON.stringify({ [uid]: googleIdentityId });
    await appendDecision("approved", otherIdentityId);
    expect((await callMe(await tokenFor(uid, "google", ["email", "google"]))).status).toBe(403);
    await appendDecision("revoked", otherIdentityId);
    delete process.env.GOOGLE_OAUTH_APPROVED_IDENTITIES;
  });

  test("exact audited identity authorizes existing student without changing PMS User or Student IDs", async () => {
    await appendDecision("approved", googleIdentityId);
    const response = await callMe(await tokenFor(uid, "google", ["email", "google"]));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(userId);
    expect(response.body.roles).toContain("student");
    expect((await callMe(await tokenFor(otherUid, "google", ["google"]))).status).toBe(403);
  });

  test("approved student portal ignores a claimed second Student ID; different UID receives 403", async () => {
    const ownStudent = await prisma.student.findUniqueOrThrow({ where: { userId }, select: { id: true } });
    const otherStudent = await prisma.student.findFirst({ where: { id: { not: ownStudent.id } }, select: { id: true } });
    const targetId = otherStudent?.id ?? "00000000-0000-4000-8000-000000000299";
    const ownHome = await callHome(await tokenFor(uid, "google", ["email", "google"]), targetId);
    expect(ownHome.status).toBe(200);
    expect(ownHome.body.student?.id).toBe(ownStudent.id);
    expect(ownHome.body.student?.id).not.toBe(targetId);
    expect((await callHome(await tokenFor(otherUid, "google", ["google"]), ownStudent.id)).status).toBe(403);
  });

  test("approved linked identity preserves existing email/password token access to the same PMS user", async () => {
    const passwordResponse = await callMe(await tokenFor(uid, "email", ["email"]));
    expect(passwordResponse.status).toBe(200);
    expect(passwordResponse.body.id).toBe(userId);
    expect(passwordResponse.body.roles).toContain("student");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { authId: true } })).authId).toBe(uid);
  });

  test("a later staff role immediately disables previously approved Google and password sessions", async () => {
    const admin = await prisma.role.findUniqueOrThrow({ where: { slug: "admin" }, select: { id: true } });
    await prisma.userRoleAssignment.create({ data: { userId, roleId: admin.id, programmeId: null } });
    try {
      expect((await callMe(await tokenFor(uid, "google", ["email", "google"]))).status).toBe(403);
      // Supabase's provider list can be stale after promotion; both sessions
      // must be denied while the unapproved Google identity remains attached.
      expect((await callMe(await tokenFor(uid, "email", ["email"]))).status).toBe(403);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { authId: true } })).authId).toBe(uid);
    } finally {
      await prisma.userRoleAssignment.delete({ where: { userId_roleId: { userId, roleId: admin.id } } });
    }
    expect((await callMe(await tokenFor(uid, "email", ["email"]))).status).toBe(200);
  });

  test("append-only revocation blocks previously signed token; password resumes only after Google identity removal", async () => {
    const signed = await tokenFor(uid, "google", ["email", "google"]);
    await appendDecision("revoked", googleIdentityId);
    expect((await callMe(signed)).status).toBe(403);
    expect((await callMe(await tokenFor(uid, "email", ["email"]))).status).toBe(403);
    googleId = null;
    expect((await callMe(await tokenFor(uid))).status).toBe(200);
    googleId = googleIdentityId;
    let mutationBlocked = false;
    try {
      await prisma.$executeRaw`DELETE FROM pms_auth_security.google_identity_approval_event WHERE auth_uid = ${uid}`;
    } catch {
      mutationBlocked = true;
    }
    expect(mutationBlocked).toBe(true);
  });
});
