"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, ShieldCheck, UserRound } from "lucide-react";
import { normalizeCareerInterests, studentPortfolioApi } from "@/lib/student-portfolio";
import { PortalError, PortalLoading, usePortalData } from "../portal-state";

export function PortfolioProfileEditor() {
  const load = useCallback(() => studentPortfolioApi.profile(), []);
  const { data, loading, error, setData } = usePortalData(load);
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setHeadline(data.headline);
    setBio(data.bio);
    setInterests(data.careerInterests.join(", "));
  }, [data]);

  if (loading) return <PortalLoading />;
  if (error || !data) return <PortalError message={error ?? "Could not load your portfolio"} />;

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await studentPortfolioApi.updateProfile({
        headline,
        bio,
        careerInterests: normalizeCareerInterests(interests),
        visibility: data.visibility,
        publicSlug: data.publicSlug,
      });
      setData(updated);
      setSaved(true);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Could not save your portfolio profile");
    } finally {
      setSaving(false);
    }
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="flex items-start gap-4">
        <span className="rounded-2xl bg-primary/10 p-3 text-primary"><UserRound className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">PMS identity</p>
          <h2 className="mt-1 text-xl font-semibold">{data.identity.name}</h2>
          <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            <p>Student ID: {data.identity.studentId}</p>
            <p className="truncate">Email: {data.identity.email}</p>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Institutional identity is read-only here. Portfolio edits cannot change your student record or academic results.</p>
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div><h3 className="font-semibold">Professional profile</h3><p className="mt-1 text-sm text-muted-foreground">Add a short introduction for your future portfolio.</p></div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Private</span>
      </div>

      <div className="space-y-5">
        <label className="block"><span className="text-sm font-medium">Headline</span><input value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={120} placeholder="e.g. Data Science student interested in ML engineering" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" /><span className="mt-1 block text-xs text-muted-foreground">{headline.length}/120</span></label>
        <label className="block"><span className="text-sm font-medium">About me</span><textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={1000} rows={6} placeholder="Describe what you enjoy building, learning, or solving." className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" /><span className="mt-1 block text-xs text-muted-foreground">{bio.length}/1000</span></label>
        <label className="block"><span className="text-sm font-medium">Career interests</span><input value={interests} onChange={(event) => setInterests(event.target.value)} placeholder="Machine Learning, Data Engineering, Analytics" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" /><span className="mt-1 block text-xs text-muted-foreground">Separate interests with commas. Up to 12 interests, 80 characters each.</span></label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save profile"}</button>
        {saved ? <span className="text-sm font-medium text-status-on-track">Saved</span> : null}
        {saveError ? <span role="alert" className="text-sm text-destructive">{saveError}</span> : null}
      </div>
    </section>

    <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
      <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold">Private by default</h3><p className="mt-1 text-sm text-muted-foreground">This foundation does not publish an anonymous portfolio. Public sharing will use a separate privacy-filtered surface so authenticated PMS data is never exposed by simply changing this profile.</p></div></div>
    </section>
  </div>;
}
