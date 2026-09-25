import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "../src/core/db/prisma.ts";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function newClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function callMe(baseUrl: string, token: string): Promise<number> {
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await response.text();
  return response.status;
}

async function expectStatus(name: string, actual: number, expected: number): Promise<void> {
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`);
  console.log(`[uat-1141-recovery] case=${name} status=${actual} pass=yes`);
}

export async function runGoogle1141HostedUat(): Promise<void> {
  if (process.env.AUTH_UAT_1141 !== "1") return;

  const admin = newClient();
  const baseUrl = `http://127.0.0.1:${Number(process.env.PORT ?? 4000)}`;
  const baseline = await Promise.all([
    prisma.enrollment.count(),
    prisma.assessmentResult.count(),
    prisma.qaEvidence.count(),
  ]);

  const target = await prisma.user.findFirst({
    where: { name: "UAT 1141 Google Student" },
    select: {
      id: true,
      authId: true,
      email: true,
      studentProfile: { select: { id: true, userId: true } },
    },
  });
  if (!target?.authId || !target.email || !target.studentProfile?.id) {
    throw new Error("Disposable Google recovery target fixture is missing");
  }

  const latest = await prisma.$queryRaw<Array<{ action: string }>>`
    SELECT action
    FROM pms_auth_security.google_identity_approval_event
    WHERE user_id = ${target.id} AND auth_uid = ${target.authId}
    ORDER BY id DESC LIMIT 1`;
  if (latest[0]?.action !== "revoked") throw new Error("Recovery test requires the preceding append-only revocation");

  const hosted = await admin.auth.admin.getUserById(target.authId);
  if (hosted.error || !hosted.data.user) throw hosted.error ?? new Error("Hosted recovery target missing");
  const beforeProviders = new Set((hosted.data.user.identities ?? []).map((identity) => identity.provider));
  if (!beforeProviders.has("email") || !beforeProviders.has("google")) {
    throw new Error("Recovery target must begin with email and Google identities");
  }

  // Obtain a real hosted user session without exposing a token or mailbox link.
  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: target.email });
  if (generated.error) throw generated.error;
  const hash = generated.data.properties?.hashed_token;
  if (!hash) throw new Error("Recovery magic-link token hash unavailable");

  const userClient = newClient();
  const verified = await userClient.auth.verifyOtp({ token_hash: hash, type: "email" });
  if (verified.error || !verified.data.session) throw verified.error ?? new Error("Recovery session unavailable");
  const staleToken = verified.data.session.access_token;

  await expectStatus("revoked-linked-account-denied-before-unlink", await callMe(baseUrl, staleToken), 403);

  const identities = await userClient.auth.getUserIdentities();
  if (identities.error) throw identities.error;
  const googleIdentity = identities.data.identities.find((identity) => identity.provider === "google");
  if (!googleIdentity) throw new Error("Google identity missing from signed-in recovery session");

  const unlinked = await userClient.auth.unlinkIdentity(googleIdentity);
  if (unlinked.error) throw unlinked.error;
  console.log("[uat-1141-recovery] case=google-identity-unlinked pass=yes");

  const afterUnlink = await admin.auth.admin.getUserById(target.authId);
  if (afterUnlink.error || !afterUnlink.data.user) throw afterUnlink.error ?? new Error("Hosted user missing after unlink");
  const afterProviders = new Set((afterUnlink.data.user.identities ?? []).map((identity) => identity.provider));
  if (!afterProviders.has("email") || afterProviders.has("google")) {
    throw new Error("Provider unlink did not leave exactly the safe email fallback path");
  }

  // The pre-unlink JWT may still advertise Google. It must remain denied until
  // a refresh obtains provider metadata consistent with the live identity set.
  await expectStatus("stale-pre-unlink-jwt-denied", await callMe(baseUrl, staleToken), 403);

  const refreshed = await userClient.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session?.access_token) {
    throw refreshed.error ?? new Error("JWT refresh after unlink failed");
  }
  await expectStatus(
    "refreshed-email-session-recovers",
    await callMe(baseUrl, refreshed.data.session.access_token),
    200,
  );

  // Prove the existing canonical account can return to ordinary password login
  // after provider recovery, without changing PMS User/Student identifiers.
  const newPassword = `Rr9!${randomUUID()}-Kk4!`;
  const passwordSet = await userClient.auth.updateUser({ password: newPassword });
  if (passwordSet.error) throw passwordSet.error;
  const passwordClient = newClient();
  const signedIn = await passwordClient.auth.signInWithPassword({ email: target.email, password: newPassword });
  if (signedIn.error || !signedIn.data.session?.access_token) {
    throw signedIn.error ?? new Error("Password fallback sign-in failed");
  }
  await expectStatus(
    "password-fallback-after-unlink",
    await callMe(baseUrl, signedIn.data.session.access_token),
    200,
  );

  const [userAfter, studentAfter, academicAfter] = await Promise.all([
    prisma.user.findUnique({ where: { id: target.id }, select: { id: true, authId: true } }),
    prisma.student.findUnique({ where: { id: target.studentProfile.id }, select: { id: true, userId: true } }),
    Promise.all([prisma.enrollment.count(), prisma.assessmentResult.count(), prisma.qaEvidence.count()]),
  ]);
  if (userAfter?.id !== target.id || userAfter.authId !== target.authId ||
      studentAfter?.id !== target.studentProfile.id || studentAfter.userId !== target.id) {
    throw new Error("Canonical User/Student identity changed during provider recovery");
  }
  if (academicAfter.some((value, index) => value !== baseline[index])) {
    throw new Error("Academic or QA record counts changed during provider recovery");
  }

  console.log("[uat-1141-recovery] case=canonical-user-student-stable pass=yes");
  console.log("[uat-1141-recovery] case=academic-qa-counts-stable pass=yes");
  console.log("[uat-1141-recovery] PASS Google unlink/JWT refresh/password recovery");
}
