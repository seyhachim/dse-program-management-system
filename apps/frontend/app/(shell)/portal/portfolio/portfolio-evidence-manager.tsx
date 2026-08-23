"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FilePlus2, Pencil, Star, Trash2 } from "lucide-react";
import type {
  StudentPortfolioArtifactKind,
  StudentPortfolioArtifactLinkInput,
  StudentPortfolioEligibleAssessmentSource,
  StudentPortfolioEvidence,
  StudentPortfolioEvidenceOrigin,
} from "@dse-pms/shared-types";
import { PortalError, PortalLoading, usePortalData } from "../portal-state";
import { studentPortfolioApi } from "@/lib/student-portfolio";

const ORIGIN_LABELS: Record<StudentPortfolioEvidenceOrigin, string> = {
  external_project: "External project",
  course_assessment: "Course assessment",
  practicum: "Practicum",
  internship: "Internship",
  final_project: "Final project / thesis",
  competition: "Competition",
  achievement: "Achievement",
  other: "Other activity",
};

const LINK_LABELS: Record<StudentPortfolioArtifactKind, string> = {
  repository: "Repository",
  demo: "Demo",
  report: "Report",
  presentation: "Presentation",
  dataset: "Dataset",
  other: "Other",
};

type LinkDraft = StudentPortfolioArtifactLinkInput & { key: string };

function emptyLink(): LinkDraft {
  return { key: crypto.randomUUID(), kind: "repository", label: "", url: "" };
}

export function PortfolioEvidenceManager() {
  const load = useCallback(() => studentPortfolioApi.evidence(), []);
  const { data, loading, error, setData } = usePortalData(load);
  const [sources, setSources] = useState<StudentPortfolioEligibleAssessmentSource[]>([]);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StudentPortfolioEvidence | null>(null);
  const [origin, setOrigin] = useState<StudentPortfolioEvidenceOrigin>("external_project");
  const [sourceKey, setSourceKey] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [role, setRole] = useState("");
  const [contribution, setContribution] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [skills, setSkills] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [featured, setFeatured] = useState(false);
  const [links, setLinks] = useState<LinkDraft[]>([emptyLink()]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    studentPortfolioApi
      .eligibleEvidenceSources()
      .then(setSources)
      .catch((reason) => setSourceError(reason instanceof Error ? reason.message : "Could not load eligible PMS sources"));
  }, []);

  function resetForm() {
    setEditing(null);
    setOrigin("external_project");
    setSourceKey("");
    setTitle("");
    setSummary("");
    setRole("");
    setContribution("");
    setStartDate("");
    setEndDate("");
    setSkills("");
    setVisibility("private");
    setFeatured(false);
    setLinks([emptyLink()]);
    setFormError(null);
  }

  function beginEdit(item: StudentPortfolioEvidence) {
    setEditing(item);
    setOrigin(item.origin);
    setSourceKey(item.source ? `${item.source.offeringId}::${item.source.assessmentItemId}` : "");
    setTitle(item.title);
    setSummary(item.summary);
    setRole(item.role);
    setContribution(item.contribution);
    setStartDate(item.startDate ?? "");
    setEndDate(item.endDate ?? "");
    setSkills(item.skills.join(", "));
    setVisibility(item.visibility);
    setFeatured(item.featured);
    setLinks(item.links.length ? item.links.map((link) => ({ key: link.id, kind: link.kind, label: link.label, url: link.url })) : [emptyLink()]);
    setFormError(null);
  }

  function normalizedLinks(): StudentPortfolioArtifactLinkInput[] {
    return links
      .filter((link) => link.url.trim())
      .map(({ kind, label, url }) => ({ kind, label: label.trim(), url: url.trim() }));
  }

  async function refresh() {
    setData(await studentPortfolioApi.evidence());
  }

  async function save() {
    if (!title.trim()) {
      setFormError("Title is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const presentation = {
      title,
      summary,
      role,
      contribution,
      startDate: startDate || null,
      endDate: endDate || null,
      skills: [...new Set(skills.split(",").map((item) => item.trim()).filter(Boolean))],
      visibility,
      featured,
      links: normalizedLinks(),
    };
    try {
      if (editing) {
        await studentPortfolioApi.updateEvidence(editing.id, presentation);
      } else {
        let source = null;
        if (origin === "course_assessment") {
          const [offeringId, assessmentItemId] = sourceKey.split("::");
          if (!offeringId || !assessmentItemId) throw new Error("Choose an eligible course assessment source.");
          source = { type: "course_assessment" as const, offeringId, assessmentItemId };
        }
        await studentPortfolioApi.createEvidence({ ...presentation, origin, source });
      }
      await refresh();
      resetForm();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Could not save portfolio evidence");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: StudentPortfolioEvidence) {
    if (!window.confirm(`Remove “${item.title}” from your portfolio? This will not delete its academic source.`)) return;
    try {
      await studentPortfolioApi.deleteEvidence(item.id);
      await refresh();
      if (editing?.id === item.id) resetForm();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Could not remove portfolio evidence");
    }
  }

  if (loading) return <PortalLoading />;
  if (error || !data) return <PortalError message={error ?? "Could not load portfolio evidence"} />;

  return <div className="mx-auto mt-6 max-w-5xl space-y-6">
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Evidence</p>
          <h2 className="mt-1 text-xl font-semibold">Projects & showcase items</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add your own work or link an eligible assessment from one of your enrolled courses.</p>
        </div>
        <FilePlus2 className="h-6 w-6 text-primary" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">Evidence type</span><select value={origin} disabled={Boolean(editing)} onChange={(event) => { setOrigin(event.target.value as StudentPortfolioEvidenceOrigin); setSourceKey(""); }} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm disabled:opacity-60">{Object.entries(ORIGIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {origin === "course_assessment" ? <label className="block"><span className="text-sm font-medium">PMS source</span><select value={sourceKey} disabled={Boolean(editing)} onChange={(event) => setSourceKey(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm disabled:opacity-60"><option value="">Select an eligible assessment</option>{sources.map((source) => <option key={`${source.offeringId}:${source.assessmentItemId}`} value={`${source.offeringId}::${source.assessmentItemId}`}>{source.courseCode} · {source.assessmentName} · {source.term}/{source.sectionCode}</option>)}</select>{sourceError ? <span className="mt-1 block text-xs text-destructive">{sourceError}</span> : null}{editing ? <span className="mt-1 block text-xs text-muted-foreground">Academic provenance is immutable after creation.</span> : null}</label> : <div />}
        <label className="block md:col-span-2"><span className="text-sm font-medium">Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></label>
        <label className="block md:col-span-2"><span className="text-sm font-medium">Summary</span><textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={1500} rows={3} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></label>
        <label className="block"><span className="text-sm font-medium">Role</span><input value={role} onChange={(event) => setRole(event.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></label>
        <label className="block"><span className="text-sm font-medium">Skills / tags</span><input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="Python, Forecasting, Teamwork" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></label>
        <label className="block md:col-span-2"><span className="text-sm font-medium">Your contribution</span><textarea value={contribution} onChange={(event) => setContribution(event.target.value)} maxLength={1500} rows={3} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></label>
        <label className="block"><span className="text-sm font-medium">Start date</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></label>
        <label className="block"><span className="text-sm font-medium">End date</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></label>
        <label className="block"><span className="text-sm font-medium">Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as "private" | "public")} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"><option value="private">Private</option><option value="public">Eligible for future public portfolio</option></select></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /> Featured item</label>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between"><span className="text-sm font-medium">Artifact links</span><button type="button" onClick={() => setLinks((current) => [...current, emptyLink()])} className="text-sm font-medium text-primary">+ Add link</button></div>
        {links.map((link) => <div key={link.key} className="grid gap-2 sm:grid-cols-[140px_1fr_2fr_auto]"><select value={link.kind} onChange={(event) => setLinks((current) => current.map((item) => item.key === link.key ? { ...item, kind: event.target.value as StudentPortfolioArtifactKind } : item))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">{Object.entries(LINK_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input value={link.label} onChange={(event) => setLinks((current) => current.map((item) => item.key === link.key ? { ...item, label: event.target.value } : item))} placeholder="Label" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" /><input value={link.url} onChange={(event) => setLinks((current) => current.map((item) => item.key === link.key ? { ...item, url: event.target.value } : item))} placeholder="https://…" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" /><button type="button" onClick={() => setLinks((current) => current.length === 1 ? [emptyLink()] : current.filter((item) => item.key !== link.key))} className="rounded-xl border border-border px-3 text-sm text-muted-foreground">Remove</button></div>)}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={save} disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? "Saving…" : editing ? "Save changes" : "Add evidence"}</button>{editing ? <button type="button" onClick={resetForm} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">Cancel</button> : null}{formError ? <span role="alert" className="text-sm text-destructive">{formError}</span> : null}</div>
    </section>

    <section className="space-y-3">
      {data.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No portfolio evidence yet. Add a project or an eligible course assessment above.</div> : data.map((item) => <article key={item.id} className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.title}</h3>{item.featured ? <Star className="h-4 w-4 fill-current text-primary" /> : null}<span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{ORIGIN_LABELS[item.origin]}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{item.visibility}</span></div>{item.summary ? <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p> : null}</div><div className="flex gap-2"><button type="button" onClick={() => beginEdit(item)} className="rounded-lg border border-border p-2" aria-label={`Edit ${item.title}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => remove(item)} className="rounded-lg border border-border p-2 text-destructive" aria-label={`Remove ${item.title}`}><Trash2 className="h-4 w-4" /></button></div></div>
        {item.source ? <div className="mt-3 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">{item.source.available ? <span>PMS source: {item.source.courseCode} · {item.source.assessmentName} · {item.source.term}/{item.source.sectionCode}</span> : <span>PMS source is currently restricted or unavailable. Provenance is retained, but source details are hidden.</span>}</div> : null}
        {item.skills.length ? <div className="mt-3 flex flex-wrap gap-2">{item.skills.map((skill) => <span key={skill} className="rounded-full border border-border px-2 py-1 text-xs">{skill}</span>)}</div> : null}
        {item.links.length ? <div className="mt-3 flex flex-wrap gap-3">{item.links.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary"><ExternalLink className="h-3.5 w-3.5" />{link.label || LINK_LABELS[link.kind]}</a>)}</div> : null}
      </article>)}
    </section>
  </div>;
}
