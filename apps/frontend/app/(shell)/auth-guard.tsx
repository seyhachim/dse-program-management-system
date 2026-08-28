"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";

/**
 * Gates the authenticated shell. A live session is necessary but not sufficient:
 * accounts marked `mustChangePassword` are kept out of every normal shell page
 * until the dedicated recovery screen clears the server-side gate.
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

  if (!sessionReady || meLoading || !me || me.mustChangePassword) return null;
  return <>{children}</>;
}
