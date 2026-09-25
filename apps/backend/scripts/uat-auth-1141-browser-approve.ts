import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../src/core/db/prisma.ts";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export async function runBrowserApprovalUat(): Promise<void> {
  if (process.env.AUTH_UAT_1141_BROWSER_APPROVE !== "1") return;

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const port = Number(process.env.PORT ?? 4000);
  const baseUrl = `http://127.0.0.1:${port}`;

  const [target, operator] = await Promise.all([
    prisma.user.findFirst({
      where: { name: "UAT 1141 Browser OAuth Student" },
      select: { id: true, authId: true },
    }),
    prisma.user.findFirst({
      where: { name: "UAT 1141 Independent Operator" },
      select: { id: true, authId: true, email: true },
    }),
  ]);

  if (!target?.authId) throw new Error("Browser OAuth student fixture missing");
  if (!operator?.authId || !operator.email) throw new Error("Independent operator fixture missing");

  const hosted = await supabase.auth.admin.getUserById(target.authId);
  if (hosted.error || !hosted.data.user) throw hosted.error ?? new Error("Hosted target missing");
  const googleIds = (hosted.data.user.identities ?? [])
    .filter((identity) => identity.provider === "google" && identity.id)
    .map((identity) => identity.id!);
  if (googleIds.length !== 1) throw new Error("Expected exactly one current Google identity");

  const password = `Ap9!${randomUUID()}-Zz4!`;
  const changed = await supabase.auth.admin.updateUserById(operator.authId, { password });
  if (changed.error) throw changed.error;

  const signedIn = await supabase.auth.signInWithPassword({ email: operator.email, password });
  if (signedIn.error || !signedIn.data.session?.access_token) {
    throw signedIn.error ?? new Error("Operator sign-in failed");
  }

  const response = await fetch(`${baseUrl}/api/auth/google/approve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${signedIn.data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      targetUserId: target.id,
      authUid: target.authId,
      googleIdentityId: googleIds[0],
      evidenceReference: `BROWSER_UAT_${Date.now().toString(36)}`,
      reason: "Disposable browser OAuth pilot approval",
      adminPassword: password,
      studentRecordVerified: true,
      directConsentVerified: true,
      providerOwnershipVerified: true,
    }),
  });
  const text = await response.text();
  if (response.status !== 201) {
    throw new Error(`Approval failed with HTTP ${response.status}: ${text.slice(0,120)}`);
  }

  console.log("[uat-1141-browser] exact Google identity approved through normal API");
}
