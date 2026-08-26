"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormFieldLabel, Input } from "@dse-pms/ui";
import { getSupabase } from "@/lib/supabase";

/**
 * Landing page for Supabase invite / recovery links. The JS client detects the
 * session from the URL on load; an invited lecturer then sets their password here
 * and is sent into the app. If no session is present the link is invalid/expired.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    const settle = (hasSession: boolean) => setStatus(hasSession ? "ready" : "invalid");
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) settle(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => settle(!!session));
    // Give the client a moment to parse the URL before declaring the link invalid.
    const t = setTimeout(() => setStatus((s) => (s === "checking" ? "invalid" : s)), 2500);
    return () => {
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await getSupabase().auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
        {status === "checking" ? (
          <p className="text-sm text-muted-foreground">Verifying your invite…</p>
        ) : status === "invalid" ? (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold text-foreground">Link expired</h1>
            <p className="text-sm text-muted-foreground">
              This invite link is invalid or has expired. Ask an administrator to resend it.
            </p>
            <Button variant="outline" className="w-full" onClick={() => router.replace("/login")}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold text-foreground">Set your password</h1>
              <p className="text-sm text-muted-foreground">Choose a password to finish setting up your account.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-1.5">
                <FormFieldLabel required>New password</FormFieldLabel>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <FormFieldLabel required>Confirm new password</FormFieldLabel>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </label>
              {error ? <p className="text-sm text-status-live">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Saving…" : "Set password & continue"}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
