"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@dse-pms/ui";
import { authApi } from "@/lib/auth";
import {
  GOOGLE_OAUTH_RETURN_KEY,
  GOOGLE_PILOT_ENABLED,
  googleLoginRedirect,
  safeGoogleReturnPath,
} from "@/lib/google-auth";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";

function GooglePilotSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeGoogleReturnPath(params.get("next"));
  const callback = params.get("callback") === "1";
  const enabled = GOOGLE_PILOT_ENABLED && AUTH_MODE === "supabase";
  const [working, setWorking] = useState(callback);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !callback) return;
    let active = true;
    const complete = async () => {
      let destination = "/";
      try {
        destination = safeGoogleReturnPath(window.sessionStorage.getItem(GOOGLE_OAUTH_RETURN_KEY));
        window.sessionStorage.removeItem(GOOGLE_OAUTH_RETURN_KEY);
      } catch { /* safe home fallback */ }
      if (params.has("error")) throw new Error("OAuth declined");
      const supabase = getSupabase();
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session.session) throw new Error("Missing session");
      const { data: user, error: userError } = await supabase.auth.getUser();
      if (userError || !user.user || user.user.id !== session.session.user.id) throw new Error("Invalid session");
      const { data: identities, error: identitiesError } = await supabase.auth.getUserIdentities();
      if (identitiesError || !identities.identities.some((identity) => identity.provider === "google")) {
        throw new Error("Google identity not linked");
      }
      // A verified Gmail alone is not an authorized PMS student. The backend
      // must resolve the existing UID and its original student role.
      const current = await authApi.me();
      if (!current.roles.includes("student")) throw new Error("Not an authorized student");
      if (active) router.replace(destination);
    };
    void complete().catch(async () => {
      await getSupabase().auth.signOut().catch(() => undefined);
      if (active) {
        setError("This Google account is not connected to an authorized PMS student account. Sign in with your existing PMS account first to connect Google.");
        setWorking(false);
      }
    });
    return () => { active = false; };
  }, [callback, enabled, params, router]);

  const signIn = async () => {
    if (!enabled || working) return;
    setWorking(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        setError("You are already signed in. Connect Google from your existing PMS student account instead.");
        setWorking(false);
        return;
      }
      window.sessionStorage.setItem(GOOGLE_OAUTH_RETURN_KEY, next);
      window.history.replaceState(null, "", "/google-sign-in");
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: googleLoginRedirect(window.location.origin) },
      });
      if (oauthError) throw oauthError;
    } catch {
      try { window.sessionStorage.removeItem(GOOGLE_OAUTH_RETURN_KEY); } catch { /* unavailable */ }
      setError("Could not start Google sign-in. Please try again.");
      setWorking(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold text-foreground">Google sign-in pilot</h1>
        <p className="text-sm text-muted-foreground">Connect Google from your existing verified PMS student account before using this sign-in option.</p>
        {!enabled ? (
          <p role="status" className="text-sm text-muted-foreground">Google sign-in is not enabled yet.</p>
        ) : callback && working ? (
          <p role="status" className="text-sm text-muted-foreground">Verifying your PMS account…</p>
        ) : (
          <Button type="button" disabled={working || callback} onClick={signIn}>{working ? "Connecting…" : "Continue with Google"}</Button>
        )}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <p><Link className="text-sm text-primary underline-offset-4 hover:underline" href="/login">Use PMS email and password instead</Link></p>
      </div>
    </main>
  );
}

export default function GooglePilotSignInPage() {
  return <Suspense fallback={<main className="min-h-screen bg-background" aria-busy="true" />}><GooglePilotSignIn /></Suspense>;
}
