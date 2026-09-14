"use client";

import { useEffect, useState } from "react";
import {
  USER_HONORIFIC_LABELS,
  UserHonorificSchema,
  type UserHonorific,
} from "@dse-pms/shared-types";
import { Button, FormFieldLabel, Input } from "@dse-pms/ui";
import { invalidateMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { lecturersApi } from "@/lib/lecturers";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";
import { LecturerAvatar } from "@/components/lecturer-avatar";

type ProfileForm = {
  name: string;
  email: string;
  honorific: UserHonorific | "";
  title: string;
  qualification: string;
  phone: string;
  profileImageUrl: string;
  employmentType: string;
  fieldOfSpecialization: string;
  yearsOfExperience: string;
  shortBio: string;
  programmeStartDate: string;
};

const EMPTY: ProfileForm = {
  name: "",
  email: "",
  honorific: "",
  title: "",
  qualification: "",
  phone: "",
  profileImageUrl: "",
  employmentType: "",
  fieldOfSpecialization: "",
  yearsOfExperience: "",
  shortBio: "",
  programmeStartDate: "",
};

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
        honorific: profile.honorific ?? "",
        title: profile.title ?? "",
        qualification: profile.qualification ?? "",
        phone: profile.phone ?? "",
        profileImageUrl: profile.profileImageUrl ?? "",
        employmentType: profile.professionalProfile?.employmentType ?? "",
        fieldOfSpecialization: profile.professionalProfile?.fieldOfSpecialization ?? "",
        yearsOfExperience: profile.professionalProfile?.yearsOfExperience?.toString() ?? "",
        shortBio: profile.professionalProfile?.shortBio ?? "",
        programmeStartDate: profile.professionalProfile?.programmeStartDate ?? "",
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
      const yearsOfExperience = form.yearsOfExperience.trim() === ""
        ? null
        : Number(form.yearsOfExperience);
      if (yearsOfExperience !== null && (!Number.isInteger(yearsOfExperience) || yearsOfExperience < 0 || yearsOfExperience > 80)) {
        setError("Years of experience must be a whole number between 0 and 80.");
        return;
      }

      const profile = await lecturersApi.updateMe({
        name: form.name,
        honorific: form.honorific || null,
        title: form.title || null,
        qualification: form.qualification || null,
        phone: form.phone || null,
        profileImageUrl: form.profileImageUrl || null,
        employmentType: form.employmentType || null,
        fieldOfSpecialization: form.fieldOfSpecialization || null,
        yearsOfExperience,
        shortBio: form.shortBio || null,
        programmeStartDate: form.programmeStartDate || null,
      });
      setForm((current) => ({
        ...current,
        name: profile.name,
        honorific: profile.honorific ?? "",
        title: profile.title ?? "",
        qualification: profile.qualification ?? "",
        phone: profile.phone ?? "",
        profileImageUrl: profile.profileImageUrl ?? "",
        employmentType: profile.professionalProfile?.employmentType ?? "",
        fieldOfSpecialization: profile.professionalProfile?.fieldOfSpecialization ?? "",
        yearsOfExperience: profile.professionalProfile?.yearsOfExperience?.toString() ?? "",
        shortBio: profile.professionalProfile?.shortBio ?? "",
        programmeStartDate: profile.professionalProfile?.programmeStartDate ?? "",
      }));
      invalidateMe();
      setMessage("Professional profile updated successfully.");
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
      {message ? <p className="rounded-lg border border-status-live/30 bg-status-live-bg p-3 text-sm text-status-live">{message}</p> : null}
      {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div>
          <h2 className="font-semibold text-foreground">Professional profile</h2>
          <p className="text-sm text-muted-foreground">
            Identity and contact fields continue to feed Course Specifications; professional details also appear in My Portfolio.
          </p>
        </div>
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/20 p-4">
            <LecturerAvatar name={form.name || "Lecturer"} imageUrl={form.profileImageUrl || null} size="lg" />
            <div className="min-w-0 flex-1">
              <Field label="Profile image URL">
                <Input
                  type="url"
                  value={form.profileImageUrl}
                  onChange={(e) => setField("profileImageUrl", e.target.value)}
                  placeholder="https://…"
                />
                <span className="text-xs text-muted-foreground">Use a stable HTTPS image URL. Expiring signed URLs are rejected.</span>
              </Field>
            </div>
          </div>
          <Field label="Name" required><Input value={form.name} onChange={(e) => setField("name", e.target.value)} required /></Field>
          <Field label="Email"><Input type="email" value={form.email} disabled aria-describedby="email-help" /><span id="email-help" className="text-xs text-muted-foreground">Contact an administrator to change your email.</span></Field>
          <Field label="Honorific">
            <select
              value={form.honorific}
              onChange={(event) => setField("honorific", event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">No honorific</option>
              {UserHonorificSchema.options.map((honorific) => (
                <option key={honorific} value={honorific}>{USER_HONORIFIC_LABELS[honorific]}</option>
              ))}
            </select>
          </Field>
          <Field label="Academic position"><Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="Lecturer / Assistant Professor" /></Field>
          <Field label="Qualification"><Input value={form.qualification} onChange={(e) => setField("qualification", e.target.value)} placeholder="MSc in Data Science" /></Field>
          <Field label="Telephone"><Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} /></Field>

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">Portfolio details</h3>
            <p className="mt-1 text-xs text-muted-foreground">These fields describe your professional background; they do not change teaching assignments.</p>
          </div>
          <Field label="Employment type"><Input value={form.employmentType} onChange={(e) => setField("employmentType", e.target.value)} placeholder="Full Time" /></Field>
          <Field label="Field of specialization"><Input value={form.fieldOfSpecialization} onChange={(e) => setField("fieldOfSpecialization", e.target.value)} placeholder="Machine Learning, Time Series, Smart Agriculture" /></Field>
          <Field label="Years of experience"><Input type="number" min={0} max={80} step={1} value={form.yearsOfExperience} onChange={(e) => setField("yearsOfExperience", e.target.value)} placeholder="8" /></Field>
          <Field label="DSE programme start date">
            <Input type="date" value={form.programmeStartDate} onChange={(e) => setField("programmeStartDate", e.target.value)} />
            <span className="text-xs text-muted-foreground">Used to derive whether dated professional evidence is prior to DSE or during DSE service. It does not change employment records elsewhere.</span>
          </Field>
          <Field label="Short bio">
            <textarea
              value={form.shortBio}
              onChange={(e) => setField("shortBio", e.target.value)}
              maxLength={4000}
              rows={5}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Brief professional biography"
            />
          </Field>

          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save professional profile"}</Button>
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
