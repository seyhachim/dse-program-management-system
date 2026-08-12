"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input } from "@dse-pms/ui";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (AUTH_MODE !== "supabase") {
      setError("Password recovery is available only with Supabase authentication.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?mode=recovery`;
    const { error: providerError } = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo });
    setSubmitting(false);
    if (providerError) {
      setError(providerError.message);
      return;
    }
    setSent(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
            {sent ? "Check your email for a password recovery link." : "Enter the email address for your account."}
          </p>
        </div>
        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Email</span>
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            {error ? <p className="text-sm text-status-live">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Sending…" : "Send recovery link"}
            </Button>
          </form>
        ) : null}
        <Link className="block text-center text-sm text-primary hover:underline" href="/login">Back to sign in</Link>
      </div>
    </main>
  );
}
