import { createClient } from "@supabase/supabase-js";
import { prisma } from "../src/core/db/prisma.ts";
import { verifySupabaseToken } from "../src/core/auth/token.ts";
import { decodeProtectedHeader, decodeJwt } from "jose";

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
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (users.error) throw users.error;
    let googleLinked: { email?: string | null } | null = null;
    for (const candidate of users.data.users) {
      const detail = await admin.auth.admin.getUserById(candidate.id);
      if (detail.error || !detail.data.user) continue;
      const providers = new Set(detail.data.user.identities?.map((identity) => identity.provider) ?? []);
      if (detail.data.user.email && providers.has("google") && providers.has("email")) {
        googleLinked = detail.data.user;
        break;
      }
    }
    if (!googleLinked?.email) throw new Error("No disposable email+Google hosted identity available for social-provider regression");
    const googleLinkedToken = await sessionForEmail(admin, googleLinked.email);
    await record("same-uid-current-google-identity", googleLinkedToken, 403);

    // 6) Per-request Admin verification latency sample on the successful bound account.
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
      `[uat-1143] admin-verification-latency samples=5 minMs=${min.toFixed(1)} avgMs=${avg.toFixed(1)} maxMs=${max.toFixed(1)}`,
    );
  } finally {
    // Cleanup only synthetic rows created by this harness.
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    for (const authId of createdAuthIds) {
      await admin.auth.admin.deleteUser(authId);
    }
  }
}
