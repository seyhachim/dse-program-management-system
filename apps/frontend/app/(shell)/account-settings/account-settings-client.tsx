"use client";

import { useEffect, useState } from "react";
import { Button, FormFieldLabel, Input } from "@dse-pms/ui";
import { invalidateMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { lecturersApi } from "@/lib/lecturers";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";

type ProfileForm = { name: string; email: string; title: string; qualification: string; phone: string };
const EMPTY: ProfileForm = { name: "", email: "", title: "", qualification: "", phone: "" };

export function AccountSettingsClient() {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    lecturersApi.me()
      .then((profile) => setForm({
        name: profile.name,
        email: profile.email,
        title: profile.title ?? "",
        qualification: profile.qualification ?? "",
        phone: profile.phone ?? "",
      }))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your profile"))
      .finally(() => setLoading(false));
  }, []);

  const setField = (field: keyof ProfileForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const profile = await lecturersApi.updateMe({
        name: form.name,
        title: form.title || null,
        qualification: form.qualification || null,
        phone: form.phone || null,
      });
      setForm((current) => ({ ...current, name: profile.name }));
      invalidateMe();
      setMessage("Profile updated successfully.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update your profile");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (AUTH_MODE !== "supabase") {
      setError("Password changes are available only with Supabase authentication.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setChangingPassword(true);
    const { error: providerError } = await getSupabase().auth.updateUser({ password });
    setChangingPassword(false);
    if (providerError) {
      setError(providerError.message);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setMessage("Password changed successfully.");
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading account settings…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {message ? <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div><h2 className="font-semibold text-foreground">Lecturer profile</h2><p className="text-sm text-muted-foreground">These details are used in Course Specifications.</p></div>
        <form onSubmit={saveProfile} className="space-y-4">
          <Field label="Name" required><Input value={form.name} onChange={(e) => setField("name", e.target.value)} required /></Field>
          <Field label="Email"><Input type="email" value={form.email} disabled aria-describedby="email-help" /><span id="email-help" className="text-xs text-muted-foreground">Contact an administrator to change your email.</span></Field>
          <Field label="Title"><Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="Dr., Mr., Ms." /></Field>
          <Field label="Qualification"><Input value={form.qualification} onChange={(e) => setField("qualification", e.target.value)} placeholder="PhD, MSc, …" /></Field>
          <Field label="Telephone"><Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} /></Field>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button>
        </form>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div><h2 className="font-semibold text-foreground">Change password</h2><p className="text-sm text-muted-foreground">Use at least 8 characters.</p></div>
        {AUTH_MODE === "supabase" ? (
          <form onSubmit={changePassword} className="space-y-4">
            <Field label="New password" required><Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <Field label="Confirm new password" required><Input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></Field>
            <Button type="submit" disabled={changingPassword}>{changingPassword ? "Changing…" : "Change password"}</Button>
          </form>
        ) : <p className="text-sm text-muted-foreground">Password management is unavailable in development-token mode.</p>}
      </section>
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><FormFieldLabel required={required}>{label}</FormFieldLabel>{children}</label>;
}
