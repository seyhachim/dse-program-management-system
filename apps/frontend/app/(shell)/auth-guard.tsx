"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";
import { ShellLoadingFrame } from "./shell-loading";

/**
 * Gates the authenticated shell. A live session is necessary but not sufficient:
 * accounts marked `mustChangePassword` are kept out of every normal shell page
 * until the dedicated recovery screen clears the server-side gate.
 *
 * While session/account checks run we render neutral shell-shaped chrome only;
 * the protected children (including role-sensitive navigation) are not mounted.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sessionReady, setSessionReady] = useState(AUTH_MODE === "dev");
  const [signingOut, setSigningOut] = useState(false);
  const { me, loading: meLoading, error: meError, retry } = useMe();

  useEffect(() => {
    if (AUTH_MODE !== "supabase") return;
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSessionReady(true);
      else router.replace("/login");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (sessionReady && !meLoading && me?.mustChangePassword) {
      router.replace("/change-password");
    }
  }, [me, meLoading, router, sessionReady]);

  const signInAgain = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (AUTH_MODE === "supabase") {
        await getSupabase().auth.signOut();
      }
    } finally {
      router.replace("/login");
    }
  };

  if (!sessionReady || meLoading || me?.mustChangePassword) {
    return <ShellLoadingFrame />;
  }

  if (meError || !me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div
          role="alert"
          className="w-full max-w-md rounded-xl border border-status-upcoming bg-status-upcoming-bg p-5 text-status-upcoming"
        >
          <p className="text-sm font-medium">We could not verify your DSE-PMS account access.</p>
          <p className="mt-1 text-sm opacity-90">
            Your account remains protected. Retry the check, or sign in again if your session has changed.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={retry}
              className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => void signInAgain()}
              disabled={signingOut}
              className="rounded-md border border-current px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? "Signing out…" : "Sign in again"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
