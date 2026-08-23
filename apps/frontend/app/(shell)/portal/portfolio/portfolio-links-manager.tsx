"use client";

import { useCallback, useState } from "react";
import { ExternalLink, Link2, Pencil, Trash2 } from "lucide-react";
import type { StudentPortfolioProfessionalLink, StudentPortfolioProfessionalProvider } from "@dse-pms/shared-types";
import { studentPortfolioApi } from "@/lib/student-portfolio";
import { PortalError, PortalLoading, usePortalData } from "../portal-state";

const PROVIDERS: Array<{ value: StudentPortfolioProfessionalProvider; label: string }> = [
  { value: "github", label: "GitHub" }, { value: "gitlab", label: "GitLab" },
  { value: "linkedin", label: "LinkedIn" }, { value: "kaggle", label: "Kaggle" },
  { value: "hugging_face", label: "Hugging Face" }, { value: "website", label: "Personal website" },
  { value: "cv", label: "CV / Resume" }, { value: "orcid", label: "ORCID" },
  { value: "google_scholar", label: "Google Scholar" }, { value: "research_gate", label: "ResearchGate" },
  { value: "coding_practice", label: "Coding practice" }, { value: "bi_profile", label: "BI / dashboard profile" },
  { value: "other", label: "Other professional link" },
];

export function PortfolioLinksManager() {
  const load = useCallback(() => studentPortfolioApi.links(), []);
  const { data, loading, error, setData } = usePortalData(load);
  const [editing, setEditing] = useState<StudentPortfolioProfessionalLink | null>(null);
  const [provider, setProvider] = useState<StudentPortfolioProfessionalProvider>("github");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function reset() { setEditing(null); setProvider("github"); setLabel(""); setUrl(""); setVisibility("private"); setFormError(null); }
  function begin(item: StudentPortfolioProfessionalLink) { setEditing(item); setProvider(item.provider); setLabel(item.label); setUrl(item.url); setVisibility(item.visibility); setFormError(null); }
  async function refresh() { setData(await studentPortfolioApi.links()); }

  async function save() {
    setSaving(true); setFormError(null);
    try {
      const input = { provider, label, url, visibility };
      if (editing) await studentPortfolioApi.updateLink(editing.id, input);
      else await studentPortfolioApi.createLink(input);
      await refresh(); reset();
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : "Could not save link"); }
    finally { setSaving(false); }
  }

  async function remove(item: StudentPortfolioProfessionalLink) {
    if (!window.confirm(`Remove ${item.label || item.provider} from your portfolio?`)) return;
    await studentPortfolioApi.deleteLink(item.id); await refresh(); if (editing?.id === item.id) reset();
  }

  if (loading) return <PortalLoading />;
  if (error || !data) return <PortalError message={error ?? "Could not load professional links"} />;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Professional presence</p><h2 className="mt-1 text-xl font-semibold">Accounts, CV & links</h2><p className="mt-1 text-sm text-muted-foreground">Only public profile URLs are stored. No passwords or access tokens are needed.</p></div><Link2 className="h-6 w-6 text-primary" /></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label><span className="text-sm font-medium">Provider</span><select value={provider} onChange={(e) => setProvider(e.target.value as StudentPortfolioProfessionalProvider)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">{PROVIDERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span className="text-sm font-medium">Label</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My GitHub" maxLength={80} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></label>
        <label className="md:col-span-2"><span className="text-sm font-medium">Public URL</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></label>
        <label><span className="text-sm font-medium">Visibility</span><select value={visibility} onChange={(e) => setVisibility(e.target.value as "private" | "public")} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"><option value="private">Private</option><option value="public">Show on public portfolio</option></select></label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={save} disabled={saving || !url.trim()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : editing ? "Save changes" : "Add link"}</button>{editing ? <button type="button" onClick={reset} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">Cancel</button> : null}{formError ? <span role="alert" className="text-sm text-destructive">{formError}</span> : null}</div>
    </section>
    <section className="grid gap-3 md:grid-cols-2">
      {data.length === 0 ? <div className="md:col-span-2 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Add GitHub/GitLab and LinkedIn first; CV, Kaggle, Hugging Face, ORCID and other profiles can follow.</div> : data.map((item) => <article key={item.id} className="rounded-2xl border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.label || PROVIDERS.find((provider) => provider.value === item.provider)?.label}</p><p className="mt-1 text-xs text-muted-foreground">Added · {item.visibility}</p></div><div className="flex gap-1"><button type="button" onClick={() => begin(item)} className="rounded-lg p-2 hover:bg-muted" aria-label="Edit link"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => remove(item)} className="rounded-lg p-2 text-destructive hover:bg-muted" aria-label="Remove link"><Trash2 className="h-4 w-4" /></button></div></div><a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex max-w-full items-center gap-1 truncate text-sm font-medium text-primary"><ExternalLink className="h-3.5 w-3.5 shrink-0" />{item.url}</a></article>)}
    </section>
  </div>;
}
