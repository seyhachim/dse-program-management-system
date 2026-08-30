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
  const { me, loading: meLoading } = useMe();

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

  if (!sessionReady || meLoading || me?.mustChangePassword) {
    return <ShellLoadingFrame />;
  }

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div
          role="alert"
          className="w-full max-w-md rounded-xl border border-error/30 bg-error-bg p-5 text-sm text-error"
        >
          We could not verify your DSE-PMS account access. Refresh the page or sign in again.
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
