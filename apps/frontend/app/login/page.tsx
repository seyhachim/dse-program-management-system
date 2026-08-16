"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@dse-pms/ui";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";

function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnPath = useMemo(() => safeReturnPath(searchParams.get("next")), [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (AUTH_MODE !== "supabase") {
      router.replace(returnPath);
      return;
    }
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace(returnPath);
      });
  }, [returnPath, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace(returnPath);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
          <p className="text-sm text-muted-foreground">DSE Program Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Email</span>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@rupp.edu.kh" required />
          </label>
          <div className="text-right">
            <Link className="text-sm text-primary hover:underline" href="/forgot-password">Forgot password?</Link>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Password</span>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error ? <p className="text-sm text-status-live">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</Button>
        </form>
      </div>
    </main>
  );
}

/**
 * Email + password login. Only meaningful in AUTH_MODE=supabase; in dev mode the
 * app runs on the static dev token, so we just bounce to the requested safe route.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" aria-busy="true" />}>
      <LoginForm />
    </Suspense>
  );
}
