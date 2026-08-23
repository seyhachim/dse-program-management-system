"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Download, ExternalLink, FilePlus2, Pencil, ShieldCheck, Trash2, X } from "lucide-react";
import {
  LECTURER_PORTFOLIO_ITEM_KINDS,
  LECTURER_PORTFOLIO_ITEM_LABELS,
  type CreateLecturerPortfolioItemInput,
  type LecturerPortfolioItem,
  type LecturerPortfolioItemKind,
} from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { lecturersApi } from "@/lib/lecturers";

type FormState = {
  kind: LecturerPortfolioItemKind;
  title: string;
  organization: string;
  description: string;
  role: string;
  identifier: string;
  url: string;
  startDate: string;
  endDate: string;
  tags: string;
  isPublic: boolean;
  isFeatured: boolean;
};

const EMPTY_FORM: FormState = {
  kind: "qualification",
  title: "",
  organization: "",
  description: "",
  role: "",
  identifier: "",
  url: "",
  startDate: "",
  endDate: "",
  tags: "",
  isPublic: false,
  isFeatured: false,
};

export function ProfessionalEvidenceSection() {
  const [items, setItems] = useState<LecturerPortfolioItem[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<LecturerPortfolioItemKind, LecturerPortfolioItem[]>();
    for (const item of items) map.set(item.kind, [...(map.get(item.kind) ?? []), item]);
    return map;
  }, [items]);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await lecturersApi.portfolioItems());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load professional evidence");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const edit = (item: LecturerPortfolioItem) => {
    setForm({
      kind: item.kind,
      title: item.title,
      organization: item.organization,
      description: item.description,
      role: item.role,
      identifier: item.identifier,
      url: item.url,
      startDate: item.startDate ?? "",
      endDate: item.endDate ?? "",
      tags: item.tags.join(", "),
      isPublic: item.isPublic,
      isFeatured: item.isFeatured,
    });
    setEditingId(item.id);
    setShowForm(true);
    setMessage(null);
    setError(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const input: CreateLecturerPortfolioItemInput = {
      kind: form.kind,
      title: form.title,
      organization: form.organization,
      description: form.description,
      role: form.role,
      identifier: form.identifier,
      url: form.url,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      isPublic: form.isPublic,
      isFeatured: form.isFeatured,
    };
    try {
      if (editingId) {
        await lecturersApi.updatePortfolioItem(editingId, input);
        setMessage("Professional evidence updated. Any previous verification was reset for re-review.");
      } else {
        await lecturersApi.createPortfolioItem(input);
        setMessage("Professional evidence added as self-declared and private by default.");
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save professional evidence");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: LecturerPortfolioItem) => {
    if (!window.confirm(`Delete “${item.title}”?`)) return;
    setError(null);
    try {
      await lecturersApi.removePortfolioItem(item.id);
      setMessage("Professional evidence removed.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove professional evidence");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground">Professional Evidence</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Qualifications, research, projects, publications, development, certifications, memberships, profiles, supervision, and academic service. New records are private and self-declared until reviewed.
          </p>
        </div>
        <Button type="button" onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}>
          <FilePlus2 className="mr-2 h-4 w-4" /> Add record
        </Button>
      </div>

      {message ? <p className="mx-5 mt-4 rounded-lg border border-status-live/30 bg-status-live-bg p-3 text-sm text-status-live">{message}</p> : null}
      {error ? <p className="mx-5 mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

      {showForm ? (
        <form onSubmit={save} className="m-5 space-y-4 rounded-xl border border-border bg-muted/15 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-medium text-foreground">{editingId ? "Edit professional evidence" : "Add professional evidence"}</h3>
              <p className="text-xs text-muted-foreground">Edits to a reviewed record automatically reset its verification status.</p>
            </div>
            <button type="button" onClick={resetForm} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Close evidence form"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Evidence type">
              <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as LecturerPortfolioItemKind }))} className={selectClass}>
                {LECTURER_PORTFOLIO_ITEM_KINDS.map((kind) => <option key={kind} value={kind}>{LECTURER_PORTFOLIO_ITEM_LABELS[kind]}</option>)}
              </select>
            </Field>
            <Field label="Title"><Input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. MSc in Data Science" /></Field>
            <Field label="Institution / organization"><Input value={form.organization} onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))} /></Field>
            <Field label="Role / contribution"><Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="Author, Principal Investigator, Supervisor…" /></Field>
            <Field label="Identifier"><Input value={form.identifier} onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))} placeholder="DOI, certificate ID, membership ID…" /></Field>
            <Field label="External URL"><Input type="url" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://…" /></Field>
            <Field label="Start date"><Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} /></Field>
            <Field label="End date"><Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} /></Field>
            <div className="md:col-span-2"><Field label="Tags"><Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="Machine Learning, Time Series, Education" /></Field></div>
            <div className="md:col-span-2">
              <Field label="Description">
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </Field>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 text-sm sm:flex-row sm:items-center sm:gap-6">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm((f) => ({ ...f, isFeatured: e.target.checked }))} /> Featured in my portfolio</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))} /> Mark eligible for future public sharing</label>
          </div>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Add evidence"}</Button><Button type="button" variant="outline" onClick={resetForm}>Cancel</Button></div>
        </form>
      ) : null}

      <div className="p-5">
        {loading ? <p className="text-sm text-muted-foreground">Loading professional evidence…</p> : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="font-medium text-foreground">No professional evidence added yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Start with your qualifications, research interests, projects, or publications.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {LECTURER_PORTFOLIO_ITEM_KINDS.filter((kind) => grouped.has(kind)).map((kind) => (
              <div key={kind}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{LECTURER_PORTFOLIO_ITEM_LABELS[kind]}</h3>
                <div className="grid gap-3 lg:grid-cols-2">
                  {grouped.get(kind)!.map((item) => <EvidenceCard key={item.id} item={item} onEdit={() => edit(item)} onDelete={() => void remove(item)} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function AunQaStaffEvidenceSection() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{ authoritative: number; verified: number; selfDeclared: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lecturersApi.aunQaEvidence();
      setSummary({
        authoritative: data.evidence.filter((e) => e.verification === "authoritative_pms").length,
        verified: data.evidence.filter((e) => e.verification === "verified_professional").length,
        selfDeclared: data.evidence.filter((e) => e.verification === "self_declared").length,
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `lecturer-aun-qa-evidence-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate AUN-QA staff evidence");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="font-semibold text-foreground">AUN-QA Staff Evidence</h2></div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Generate a read-only evidence package with source IDs and explicit provenance. This does not create QA evidence, ratings, approvals, or change academic records.</p>
        </div>
        <Button type="button" onClick={() => void generate()} disabled={loading}><Download className="mr-2 h-4 w-4" />{loading ? "Generating…" : "Export evidence JSON"}</Button>
      </div>
      {summary ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><MiniStat label="PMS authoritative" value={summary.authoritative} /><MiniStat label="Verified professional" value={summary.verified} /><MiniStat label="Self-declared" value={summary.selfDeclared} /></div> : null}
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

function EvidenceCard({ item, onEdit, onDelete }: { item: LecturerPortfolioItem; onEdit: () => void; onDelete: () => void }) {
  const statusLabel = item.verificationStatus === "verified" ? "Verified" : item.verificationStatus === "rejected" ? "Needs correction" : "Self-declared";
  const hasAuditHistory = item.verificationEvents.length > 0;
  return (
    <article className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h4 className="font-medium text-foreground">{item.title}</h4>{item.organization ? <p className="mt-1 text-sm text-muted-foreground">{item.organization}</p> : null}</div>
        <span className="shrink-0 rounded-full border border-border bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground">{statusLabel}</span>
      </div>
      {item.description ? <p className="mt-3 line-clamp-3 text-sm leading-5 text-muted-foreground">{item.description}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {item.role ? <span>{item.role}</span> : null}{item.identifier ? <span>· {item.identifier}</span> : null}{item.startDate ? <span>· {item.startDate}{item.endDate ? ` → ${item.endDate}` : ""}</span> : null}
      </div>
      {item.tags.length ? <div className="mt-3 flex flex-wrap gap-1.5">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">{tag}</span>)}</div> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>
        <Button type="button" variant="outline" size="sm" onClick={onDelete} disabled={hasAuditHistory} title={hasAuditHistory ? "Reviewed evidence is retained for audit history; edit it instead." : undefined}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete</Button>
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />Open source</a> : null}
        <span className="ml-auto text-[11px] text-muted-foreground">{item.isPublic ? "Public-eligible" : "Private"}</span>
      </div>
      {hasAuditHistory ? <p className="mt-2 text-[11px] text-muted-foreground">Reviewed evidence is retained for auditability. Edit it to make a correction and trigger re-review.</p> : null}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium text-foreground">{label}</span>{children}</label>;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-border bg-muted/15 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold text-foreground">{value}</p></div>;
}

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
