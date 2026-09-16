"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@dse-pms/ui";
import { authApi, useMe } from "@/lib/auth";
import { GOOGLE_LINK_UID_KEY, GOOGLE_PILOT_ENABLED, googleLinkRedirect } from "@/lib/google-auth";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";

/**
 * Pilot-only: an already provisioned student explicitly links Google to their
 * existing Supabase UID. The roster Gmail is never used to grant access.
 */
export default function ConnectGooglePage() {
  const { me, loading } = useMe();
  const [checking, setChecking] = useState(true);
  const [linked, setLinked] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligible = GOOGLE_PILOT_ENABLED && AUTH_MODE === "supabase" && me?.roles.includes("student");

  useEffect(() => {
    if (loading) return;
    if (!eligible) { setChecking(false); return; }
    let active = true;
    const check = async () => {
      const supabase = getSupabase();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Your PMS session could not be verified.");
      const callback = new URLSearchParams(window.location.search).get("callback") === "1";
      if (callback) {
        const initialUid = window.sessionStorage.getItem(GOOGLE_LINK_UID_KEY);
        window.sessionStorage.removeItem(GOOGLE_LINK_UID_KEY);
        if (!initialUid || initialUid !== userData.user.id) {
          throw new Error("Your sign-in account changed while connecting Google. Please sign in again.");
        }
      }
      // The backend remains authoritative for the existing PMS user and role.
      const authorized = await authApi.me();
      if (!authorized.roles.includes("student")) throw new Error("This account is not an authorized student.");
      const { data, error: identitiesError } = await supabase.auth.getUserIdentities();
      if (identitiesError) throw identitiesError;
      if (active) setLinked(data.identities.some((identity) => identity.provider === "google"));
    };
    void check().catch(() => {
      if (active) setError("We could not verify Google linking. Please sign in again and contact DSE support if this persists.");
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [eligible, loading]);

  const connect = async () => {
    if (!eligible || checking || linked || connecting || error) return;
    setConnecting(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) throw new Error("Missing PMS session");
      // Require a fresh authorization check before starting the external flow.
      const current = await authApi.me();
      if (!current.roles.includes("student")) throw new Error("Not authorized");
      window.sessionStorage.setItem(GOOGLE_LINK_UID_KEY, data.user.id);
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: googleLinkRedirect(window.location.origin) },
      });
      if (linkError) throw linkError;
    } catch {
      try { window.sessionStorage.removeItem(GOOGLE_LINK_UID_KEY); } catch { /* unavailable */ }
      setError("Google could not be connected. Sign in with your existing PMS account and try again.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold text-foreground">Connect your Google account</h1>
      <p className="text-sm text-muted-foreground">Sign in to your existing DSE PMS student account first. Connecting Google does not change your student record, courses or results.</p>
      {!eligible ? (
        <p role="status" className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Google linking is available only to authorized students in the controlled pilot.</p>
      ) : checking ? (
        <p role="status" className="text-sm text-muted-foreground">Checking your PMS account…</p>
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <p role="status" className="text-sm text-foreground">{linked ? "Google is connected to your PMS sign-in." : "Google is not connected yet."}</p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {!linked ? <Button type="button" disabled={connecting || Boolean(error)} onClick={connect}>{connecting ? "Connecting…" : "Connect Google securely"}</Button> : null}
        </div>
      )}
      <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/">Return to PMS</Link>
    </main>
  );
}
