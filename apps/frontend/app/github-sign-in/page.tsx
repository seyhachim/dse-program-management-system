"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@dse-pms/ui";
import { authApi } from "@/lib/auth";
import { GITHUB_PILOT_ENABLED, githubLoginRedirect, safeGithubReturnPath } from "@/lib/github-auth";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";

function GithubPilotSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeGithubReturnPath(params.get("next"));
  const callback = params.get("callback") === "1";
  const enabled = GITHUB_PILOT_ENABLED && AUTH_MODE === "supabase";
  const [working, setWorking] = useState(callback);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !callback) return;
    let active = true;
    const complete = async () => {
      // The Supabase browser client completes the OAuth URL/session exchange.
      const { data, error: sessionError } = await getSupabase().auth.getSession();
      if (sessionError || !data.session) throw new Error("Missing OAuth session");
      // A signed-in GitHub identity alone is NOT a PMS account. Authorization
      // and canonical User/authId resolution must succeed in the backend.
      await authApi.me();
      if (active) router.replace(next);
    };
    void complete().catch(async () => {
      await getSupabase().auth.signOut().catch(() => undefined);
      if (active) {
        setError("This GitHub account is not linked to an authorized PMS account. Sign in with your PMS password first to connect GitHub.");
        setWorking(false);
      }
    });
    return () => { active = false; };
  }, [callback, enabled, next, router]);

  const signIn = async () => {
    if (!enabled || working) return;
    setWorking(true);
    setError(null);
    try {
      const redirectTo = githubLoginRedirect(window.location.origin, next);
      const url = new URL(redirectTo);
      url.searchParams.set("callback", "1");
      const { error: providerError } = await getSupabase().auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: url.toString() },
      });
      if (providerError) throw providerError;
    } catch {
      setError("Could not start GitHub sign-in. Please try again.");
      setWorking(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold text-foreground">GitHub sign-in pilot</h1>
        <p className="text-sm text-muted-foreground">
          Only students who have already connected GitHub from their verified PMS account can sign in here.
        </p>
        {!enabled ? (
          <p role="status" className="text-sm text-muted-foreground">GitHub sign-in is not enabled yet.</p>
        ) : callback && working ? (
          <p role="status" className="text-sm text-muted-foreground">Verifying your PMS account…</p>
        ) : (
          <Button type="button" disabled={working || callback} onClick={signIn}>
            {working ? "Connecting…" : "Continue with GitHub"}
          </Button>
        )}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <p><Link className="text-sm text-primary underline-offset-4 hover:underline" href="/login">Use PMS email and password instead</Link></p>
      </div>
    </main>
  );
}

export default function GithubPilotSignInPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" aria-busy="true" />}>
      <GithubPilotSignIn />
    </Suspense>
  );
}
