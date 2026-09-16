import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp } from "../core/app.ts";
import { verifySupabaseToken } from "../core/auth/token.ts";
import { prisma } from "../core/db/prisma.ts";

/** Runs only against a disposable, freshly seeded CI database and local mock Auth. */
const integrationDescribe = process.env.BACKEND_INTEGRATION_TESTS === "1" ? describe : describe.skip;

integrationDescribe("one student's GitHub account-matching security", () => {
  let appServer: Server | undefined;
  let jwksServer: Server | undefined;
  let authServer: Server | undefined;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
  let keyId: string;
  let baseUrl: string;
  let studentId: string;
  let originalAuthId: string | null;
  const originalMode = process.env.AUTH_MODE;
  const originalJwksUrl = process.env.SUPABASE_JWKS_URL;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const claimedUid = "00000000-0000-4000-8000-000000000101";
  const unlinkedUid = "00000000-0000-4000-8000-000000000102";
  const otherUid = "00000000-0000-4000-8000-000000000103";

  const tokenFor = (sub: string, email: string, provider: string) =>
    new SignJWT({ email, app_metadata: { provider } })
      .setProtectedHeader({ alg: "RS256", kid: keyId })
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

  const asMe = async (token: string) => {
    expect((await verifySupabaseToken(token)).email).toBe("student@dse.dev");
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status, body: await response.json() as { id?: string; roles?: string[]; error?: string } };
  };

  beforeAll(async () => {
    const student = await prisma.user.findUniqueOrThrow({
      where: { email: "student@dse.dev" },
      select: { id: true, authId: true },
    });
    studentId = student.id;
    originalAuthId = student.authId;
    await prisma.user.update({ where: { id: studentId }, data: { authId: null } });

    const keys = await generateKeyPair("RS256");
    privateKey = keys.privateKey;
    const publicJwk = await exportJWK(keys.publicKey);
    keyId = "github-account-linking-ci";
    publicJwk.kid = keyId;
    publicJwk.alg = "RS256";
    publicJwk.use = "sig";
    jwksServer = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [publicJwk] }));
    });
    jwksServer.listen(0, "127.0.0.1");
    await once(jwksServer, "listening");
    process.env.SUPABASE_JWKS_URL = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/auth/v1/.well-known/jwks.json`;

    authServer = createServer((req, res) => {
      const uid = decodeURIComponent((req.url ?? "").split("/auth/v1/admin/users/")[1] ?? "");
      res.setHeader("content-type", "application/json");
      if (!uid || uid.includes("/")) {
        res.writeHead(404);
        res.end(JSON.stringify({ message: "Not found" }));
        return;
      }
      res.end(JSON.stringify({ id: uid, email: "student@dse.dev", email_confirmed_at: "2026-09-16T00:00:00Z", identities: [{ id: `email-${uid}`, provider: "email" }] }));
    });
    authServer.listen(0, "127.0.0.1");
    await once(authServer, "listening");
    process.env.SUPABASE_URL = `http://127.0.0.1:${(authServer.address() as AddressInfo).port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "ci-only-fake-service-role-key";
    const mockClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: mockUser, error: mockError } = await mockClient.auth.admin.getUserById(claimedUid);
    expect(mockError).toBeNull();
    expect(mockUser.user?.id).toBe(claimedUid);
    process.env.AUTH_MODE = "supabase";

    appServer = createApp().listen(0, "127.0.0.1");
    await once(appServer, "listening");
    baseUrl = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (studentId) await prisma.user.update({ where: { id: studentId }, data: { authId: originalAuthId } });
    process.env.AUTH_MODE = originalMode;
    process.env.SUPABASE_JWKS_URL = originalJwksUrl;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    await Promise.all([appServer, jwksServer, authServer].map((server) => new Promise<void>((resolve, reject) => {
      if (!server) return resolve();
      server.close((error) => error ? reject(error) : resolve());
    })));
    await prisma.$disconnect();
  });

  test("a GitHub user cannot claim an unbound student profile by matching its email", async () => {
    const token = await tokenFor(unlinkedUid, "student@dse.dev", "github");
    const response = await asMe(token);
    expect(response.status).toBe(403);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: studentId }, select: { authId: true } }))
      .toEqual({ authId: null });
  });

  test("a different Supabase UID cannot impersonate a bound student even with matching email", async () => {
    await prisma.user.update({ where: { id: studentId }, data: { authId: claimedUid } });
    const token = await tokenFor(otherUid, "student@dse.dev", "github");
    const response = await asMe(token);
    expect(response.status).toBe(403);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: studentId }, select: { authId: true } }))
      .toEqual({ authId: claimedUid });
  });

  test("a GitHub identity with the same Supabase UID resolves only the existing student", async () => {
    const token = await tokenFor(claimedUid, "student@dse.dev", "github");
    const response = await asMe(token);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(studentId);
    expect(response.body.roles).toContain("student");
  });
});
