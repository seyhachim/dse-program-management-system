"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChangePasswordInput } from "@dse-pms/shared-types";
import { Button, FormFieldLabel, Input } from "@dse-pms/ui";
import { authApi, invalidateMe, useMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const [sessionReady, setSessionReady] = useState(AUTH_MODE === "dev");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (AUTH_MODE !== "supabase") return;
    getSupabase().auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setSessionReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (sessionReady && !meLoading && me && !me.mustChangePassword) {
      router.replace("/dashboard");
    }
  }, [me, meLoading, router, sessionReady]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const parsed = ChangePasswordInput.safeParse({ password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Choose a stronger password.");
      return;
    }

    setSubmitting(true);
    try {
      await authApi.changePassword(parsed.data);
      setPassword("");
      setConfirmPassword("");
      invalidateMe();
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change password");
    } finally {
      setSubmitting(false);
    }
  };

  if (!sessionReady || meLoading || !me || !me.mustChangePassword) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Choose a new password</h1>
          <p className="text-sm text-muted-foreground">
            An administrator issued a temporary password for your account. Choose your own password before continuing to DSE PMS.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <FormFieldLabel required>New password</FormFieldLabel>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={12}
            />
          </label>

          <label className="block space-y-1.5">
            <FormFieldLabel required>Confirm new password</FormFieldLabel>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={12}
            />
          </label>

          <p className="text-xs text-muted-foreground">
            Use at least 12 characters with uppercase, lowercase, a number, and a symbol.
          </p>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Changing password…" : "Change password and continue"}
          </Button>
        </form>
      </div>
    </main>
  );
}
