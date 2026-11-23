"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GOOGLE_LINK_UID_KEY, GOOGLE_PILOT_ENABLED, assertSameGoogleLinkUid } from "@/lib/google-auth";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";

/** Public callback because the PMS shell must deny a Google link before approval. */
export default function GoogleLinkCallbackPage() {
  const [message, setMessage] = useState("Verifying your Google identity…");
  const [failed, setFailed] = useState(false);
  const enabled = GOOGLE_PILOT_ENABLED && AUTH_MODE === "supabase";

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const finish = async () => {
      const supabase = getSupabase();
      let originalUid: string | null = null;
      try {
        originalUid = window.sessionStorage.getItem(GOOGLE_LINK_UID_KEY);
        window.sessionStorage.removeItem(GOOGLE_LINK_UID_KEY);
        if (!originalUid || new URLSearchParams(window.location.search).has("error")) {
          throw new Error("Missing link intent or provider error");
        }
        const { data: current, error: userError } = await supabase.auth.getUser();
        if (userError || !current.user) throw new Error("No active verified session");
        assertSameGoogleLinkUid(originalUid, current.user.id);
        const { data, error } = await supabase.auth.getUserIdentities();
        if (error || data.identities.filter((identity) => identity.provider === "google").length !== 1) {
          throw new Error("Google identity is not uniquely linked");
        }
        // Do not call /api/auth/me or enter the shell: the backend must deny
        // access until an independent administrator approves the exact pair.
        if (active) setMessage("Google is linked. DSE must independently verify and approve your identity before Google sign-in becomes available.");
      } catch {
        await supabase.auth.signOut().catch(() => undefined);
        if (active) {
          setFailed(true);
          setMessage("Google linking could not be verified. Sign in with your existing PMS password and contact DSE support.");
        }
      }
    };
    void finish();
    return () => { active = false; };
  }, [enabled]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold text-foreground">Google linking pilot</h1>
        <p role={failed ? "alert" : "status"} className="text-sm text-foreground">
          {enabled ? message : "Google linking is not enabled."}
        </p>
        <p className="text-sm text-muted-foreground">Do not share your password, access token, or Google identity details with anyone.</p>
        <Link className="text-sm text-primary underline" href="/login">Sign in with your existing PMS password</Link>
      </div>
    </main>
  );
}
