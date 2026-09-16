import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";

/** Disposable CI PostgreSQL and local Auth/JWKS only; never connect to production. */
const integrationDescribe = process.env.BACKEND_INTEGRATION_TESTS === "1" ? describe : describe.skip;

integrationDescribe("Google verified-email auto-link cannot authorize a PMS student", () => {
  const uid = "00000000-0000-4000-8000-000000000201";
  const otherUid = "00000000-0000-4000-8000-000000000202";
  const googleIdentityId = "ci-google-provider-identity";
  const otherIdentityId = "ci-wrong-google-provider-identity";
  let userId: string;
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

  beforeAll(async () => {
    const student = await prisma.user.findUniqueOrThrow({
      where: { email: "student@dse.dev" }, select: { id: true, authId: true },
    });
    userId = student.id;
    originalAuthId = student.authId;
    // Mutate only the isolated CI seed user; restored in afterAll.
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

  test("denies an auto-linked verified Gmail despite stale email-only JWT and leaves PMS UID unchanged", async () => {
    const response = await callMe(await tokenFor(uid));
    expect(response.status).toBe(403);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { authId: true } }))
      .toEqual({ authId: uid });
  });

  test("denies a wrong, missing or stale operator-approved provider identity", async () => {
    process.env.GOOGLE_OAUTH_APPROVED_IDENTITIES = JSON.stringify({ [uid]: otherIdentityId });
    expect((await callMe(await tokenFor(uid, "google", ["email", "google"]))).status).toBe(403);
    googleId = otherIdentityId;
    process.env.GOOGLE_OAUTH_APPROVED_IDENTITIES = JSON.stringify({ [uid]: googleIdentityId });
    expect((await callMe(await tokenFor(uid))).status).toBe(403);
    googleId = googleIdentityId;
  });

  test("correct approved identity accesses only the original PMS user with no Student rewrite", async () => {
    process.env.GOOGLE_OAUTH_APPROVED_IDENTITIES = JSON.stringify({ [uid]: googleIdentityId });
    const response = await callMe(await tokenFor(uid, "google", ["email", "google"]));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(userId);
    expect(response.body.roles).toContain("student");
    expect((await callMe(await tokenFor(otherUid, "google", ["google"]))).status).not.toBe(200);
  });

  test("revoked approval blocks even a previously signed token; password works after Google identity removal", async () => {
    const signed = await tokenFor(uid, "google", ["email", "google"]);
    delete process.env.GOOGLE_OAUTH_APPROVED_IDENTITIES;
    expect((await callMe(signed)).status).toBe(403);
    googleId = null;
    expect((await callMe(await tokenFor(uid))).status).toBe(200);
    googleId = googleIdentityId;
  });
});
