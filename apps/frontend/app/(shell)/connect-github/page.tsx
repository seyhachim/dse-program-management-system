"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@dse-pms/ui";
import { useMe } from "@/lib/auth";
import { GITHUB_PILOT_ENABLED, githubLinkRedirect } from "@/lib/github-auth";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";

/**
 * The student must already be signed in to their provisioned PMS account.
 * Supabase linkIdentity proves GitHub ownership and attaches it to the SAME
 * Supabase UID; we never match a GitHub email to a Student record ourselves.
 */
export default function ConnectGithubPage() {
  const { me, loading } = useMe();
  const [checking, setChecking] = useState(true);
  const [linked, setLinked] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligible = GITHUB_PILOT_ENABLED && AUTH_MODE === "supabase" && me?.roles.includes("student");

  useEffect(() => {
    if (loading) return;
    if (!eligible) {
      setChecking(false);
      return;
    }
    let active = true;
    const check = async () => {
      const { data: session, error: sessionError } = await getSupabase().auth.getUser();
      if (!active) return;
      if (sessionError || !session.user) {
        setError("Your PMS session could not be verified. Please sign in again.");
        setChecking(false);
        return;
      }
      const { data, error: providerError } = await getSupabase().auth.getUserIdentities();
      if (!active) return;
      if (providerError) setError("Could not check your connected accounts. Please try again.");
      else setLinked(data.identities.some((identity) => identity.provider === "github"));
      setChecking(false);
    };
    void check().catch(() => {
      if (active) {
        setError("Could not check your connected accounts. Please try again.");
        setChecking(false);
      }
    });
    return () => { active = false; };
  }, [eligible, loading]);

  const connect = async () => {
    if (!eligible || checking || linked || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      // This requires manual identity linking to be enabled in Supabase Auth.
      // The only redirect is the fixed same-origin route allowlisted in Supabase.
      const { error: providerError } = await getSupabase().auth.linkIdentity({
        provider: "github",
        options: { redirectTo: githubLinkRedirect(window.location.origin) },
      });
      if (providerError) setError("GitHub could not be connected. Check that identity linking is enabled and try again.");
    } catch {
      setError("Could not start GitHub linking. Please try again.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold text-foreground">Connect your GitHub account</h1>
      <p className="text-sm text-muted-foreground">
        Connect GitHub only after signing in with your existing DSE PMS account.
        Your student record, courses, and permissions stay unchanged.
      </p>
      {!eligible ? (
        <p role="status" className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          GitHub linking is available only to authorized students in the controlled pilot.
        </p>
      ) : checking ? (
        <p role="status" className="text-sm text-muted-foreground">Checking linked identities…</p>
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <p role="status" className="text-sm text-foreground">
            {linked ? "GitHub is connected to your PMS sign-in." : "GitHub is not connected yet."}
          </p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {!linked ? (
            <Button type="button" disabled={connecting} onClick={connect}>
              {connecting ? "Connecting…" : "Connect GitHub securely"}
            </Button>
          ) : null}
        </div>
      )}
      <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/">
        Return to PMS
      </Link>
    </main>
  );
}
