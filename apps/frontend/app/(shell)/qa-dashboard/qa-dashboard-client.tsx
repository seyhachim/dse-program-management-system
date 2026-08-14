"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileCheck2,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type {
  CreateQaCycleInput,
  CreateQaEvidenceInput,
  QaDashboardView,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";

const PROGRAMME_ID = "dse";

const emptyCycle = {
  title: "DSE AUN-QA Self-Assessment 2026",
  reportingStart: "2025-09-01",
  reportingEnd: "2026-08-31",
};

const emptyEvidence: Omit<CreateQaEvidenceInput, "programmeId" | "requirementCode"> = {
  title: "",
  description: "",
  kind: "externalLink",
  sourceUrl: "",
  sourceRef: "",
  reportingPeriod: "",
  status: "ready",
};

export function QaDashboardClient() {
  const { me } = useMe();
  const canWrite = me?.permissions.includes("qa:write") ?? false;
  const [data, setData] = useState<QaDashboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCycleForm, setShowCycleForm] = useState(false);
  const [cycleDraft, setCycleDraft] = useState(emptyCycle);
  const [saving, setSaving] = useState(false);
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState(emptyEvidence);
  const [assessmentFor, setAssessmentFor] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(4);
  const [narrative, setNarrative] = useState("");

  const load = useCallback(async (cycleId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ programmeId: PROGRAMME_ID });
      if (cycleId) query.set("cycleId", cycleId);
      setData(await api.get<QaDashboardView>(`/api/qa/dashboard?${query}`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load QA readiness");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const assessmentByRequirement = useMemo(
    () => new Map(data?.selfAssessments.map((item) => [item.requirementCode, item]) ?? []),
    [data],
  );
  const evidenceCountByRequirement = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of data?.evidence ?? []) {
      counts.set(item.requirementCode, (counts.get(item.requirementCode) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  async function createCycle() {
    setSaving(true);
    setError(null);
    try {
      const payload: CreateQaCycleInput = {
        programmeId: PROGRAMME_ID,
        title: cycleDraft.title,
        reportingStart: new Date(`${cycleDraft.reportingStart}T00:00:00Z`),
        reportingEnd: new Date(`${cycleDraft.reportingEnd}T23:59:59Z`),
      };
      const created = await api.post<{ id: string }>("/api/qa/cycles", payload);
      setShowCycleForm(false);
      await load(created.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create assessment cycle");
    } finally {
      setSaving(false);
    }
  }

  async function addEvidence(requirementCode: string) {
    if (!data?.selectedCycle) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(
        `/api/qa/cycles/${data.selectedCycle.id}/evidence`,
        {
          ...evidenceDraft,
          programmeId: PROGRAMME_ID,
          requirementCode,
        } satisfies CreateQaEvidenceInput,
      );
      setEvidenceFor(null);
      setEvidenceDraft(emptyEvidence);
      await load(data.selectedCycle.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not add evidence");
    } finally {
      setSaving(false);
    }
  }

  function openAssessment(requirementCode: string) {
    const current = assessmentByRequirement.get(requirementCode);
    setAssessmentFor(requirementCode);
    setRating(current?.rating ?? 4);
    setNarrative(current?.narrative ?? "");
    setEvidenceFor(null);
  }

  async function saveAssessment(requirementCode: string) {
    if (!data?.selectedCycle) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(
        `/api/qa/cycles/${data.selectedCycle.id}/requirements/${requirementCode}/self-assessment`,
        { programmeId: PROGRAMME_ID, rating, narrative },
      );
      setAssessmentFor(null);
      await load(data.selectedCycle.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save self-assessment");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading AUN-QA readiness…</div>;
  }

  if (!data) {
    return <ErrorNotice message={error ?? "QA data is unavailable"} />;
  }

  const coverage = percent(data.totals.evidenceCovered, data.totals.requirements);
  const rated = percent(data.totals.rated, data.totals.requirements);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" />
              {data.framework.name} · Version {data.framework.version}
            </div>
            <h2 className="mt-1 text-xl font-semibold text-foreground">
              {data.selectedCycle?.title ?? "Start an assessment cycle"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Coverage shows available internal evidence. Ratings are human-entered self-assessments and are not official accreditation scores.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" render={<a href={data.framework.sourceUrl} target="_blank" rel="noreferrer" />}>
              <BookOpen className="h-4 w-4" /> Official guide <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            {canWrite ? (
              <Button onClick={() => setShowCycleForm((value) => !value)}>
                <Plus className="h-4 w-4" /> New cycle
              </Button>
            ) : null}
          </div>
        </div>

        {data.cycles.length > 0 ? (
          <div className="flex flex-col gap-2 border-b border-border bg-muted/30 px-5 py-3 sm:flex-row sm:items-center">
            <label htmlFor="qa-cycle" className="text-sm font-medium">Assessment cycle</label>
            <select
              id="qa-cycle"
              value={data.selectedCycle?.id ?? ""}
              onChange={(event) => void load(event.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {data.cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.title}</option>)}
            </select>
          </div>
        ) : null}

        {showCycleForm ? (
          <div className="grid gap-3 border-b border-border bg-primary/5 p-5 md:grid-cols-[1fr_180px_180px_auto]">
            <Field label="Cycle title"><input value={cycleDraft.title} onChange={(e) => setCycleDraft({ ...cycleDraft, title: e.target.value })} className={inputClass} /></Field>
            <Field label="Reporting start"><input type="date" value={cycleDraft.reportingStart} onChange={(e) => setCycleDraft({ ...cycleDraft, reportingStart: e.target.value })} className={inputClass} /></Field>
            <Field label="Reporting end"><input type="date" value={cycleDraft.reportingEnd} onChange={(e) => setCycleDraft({ ...cycleDraft, reportingEnd: e.target.value })} className={inputClass} /></Field>
            <div className="flex items-end"><Button onClick={() => void createCycle()} disabled={saving}>Create cycle</Button></div>
          </div>
        ) : null}

        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Requirements" value={data.totals.requirements} note="8 programme criteria" />
          <Metric label="Evidence coverage" value={`${coverage}%`} note={`${data.totals.evidenceCovered} requirements covered`} />
          <Metric label="Self-rated" value={`${rated}%`} note={`${data.totals.rated} justified ratings`} />
          <Metric label="Reviewed evidence" value={data.totals.reviewedEvidence} note="requirements with reviewed evidence" />
        </div>
      </section>

      {error ? <ErrorNotice message={error} /> : null}

      {!data.selectedCycle ? (
        <section className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <FileCheck2 className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">No QA assessment cycle yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create a reporting cycle before attaching evidence or recording self-assessments.</p>
        </section>
      ) : (
        <section className="space-y-3">
          {data.criteria.map((criterion) => (
            <details key={criterion.code} className="group overflow-hidden rounded-xl border border-border bg-card" open={criterion.code === "1"}>
              <summary className="flex cursor-pointer list-none items-center gap-4 p-5 hover:bg-muted/40">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">{criterion.code}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{criterion.title}</h3>
                    <span className="text-xs font-medium text-muted-foreground">{criterion.evidenceCovered}/{criterion.total} covered · {criterion.rated}/{criterion.total} rated</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{criterion.summary}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percent(criterion.evidenceCovered, criterion.total)}%` }} /></div>
                </div>
                <ChevronDown className="h-5 w-5 text-muted-foreground transition group-open:rotate-180" />
              </summary>

              <div className="divide-y divide-border border-t border-border">
                {criterion.requirements.map((requirement) => {
                  const evidenceCount = evidenceCountByRequirement.get(requirement.code) ?? 0;
                  const assessment = assessmentByRequirement.get(requirement.code);
                  return (
                    <div key={requirement.code} className="p-4 md:px-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <span className="w-10 shrink-0 text-sm font-bold text-primary">{requirement.code}</span>
                        <p className="min-w-0 flex-1 text-sm font-medium">{requirement.title}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill complete={evidenceCount > 0} completeText={`${evidenceCount} evidence`} emptyText="No evidence" />
                          <StatusPill complete={assessment?.rating != null} completeText={`Rating ${assessment?.rating}/7`} emptyText="Not rated" />
                          {canWrite ? <Button size="sm" variant="outline" onClick={() => { setEvidenceFor(evidenceFor === requirement.code ? null : requirement.code); setAssessmentFor(null); }}>Add evidence</Button> : null}
                          {canWrite ? <Button size="sm" variant="outline" onClick={() => openAssessment(requirement.code)}>Self-assess</Button> : null}
                        </div>
                      </div>

                      {evidenceFor === requirement.code ? (
                        <div className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/30 p-4 md:grid-cols-2">
                          <Field label="Evidence title"><input value={evidenceDraft.title} onChange={(e) => setEvidenceDraft({ ...evidenceDraft, title: e.target.value })} className={inputClass} placeholder="e.g. Approved curriculum map" /></Field>
                          <Field label="Evidence type"><select value={evidenceDraft.kind} onChange={(e) => setEvidenceDraft({ ...evidenceDraft, kind: e.target.value as CreateQaEvidenceInput["kind"] })} className={inputClass}><option value="externalLink">External link</option><option value="document">Document link</option><option value="systemLink">DSE system record</option></select></Field>
                          {evidenceDraft.kind === "systemLink" ? <Field label="System reference"><input value={evidenceDraft.sourceRef} onChange={(e) => setEvidenceDraft({ ...evidenceDraft, sourceRef: e.target.value })} className={inputClass} placeholder="/programme-management or record id" /></Field> : <Field label="Evidence URL"><input type="url" value={evidenceDraft.sourceUrl} onChange={(e) => setEvidenceDraft({ ...evidenceDraft, sourceUrl: e.target.value })} className={inputClass} placeholder="https://…" /></Field>}
                          <Field label="Reporting period"><input value={evidenceDraft.reportingPeriod} onChange={(e) => setEvidenceDraft({ ...evidenceDraft, reportingPeriod: e.target.value })} className={inputClass} placeholder="2025–2026" /></Field>
                          <div className="md:col-span-2"><Field label="Why this supports the requirement"><textarea value={evidenceDraft.description} onChange={(e) => setEvidenceDraft({ ...evidenceDraft, description: e.target.value })} className={`${inputClass} min-h-20`} /></Field></div>
                          <div className="flex justify-end gap-2 md:col-span-2"><Button variant="outline" onClick={() => setEvidenceFor(null)}>Cancel</Button><Button disabled={saving} onClick={() => void addEvidence(requirement.code)}>Save evidence</Button></div>
                        </div>
                      ) : null}

                      {assessmentFor === requirement.code ? (
                        <div className="mt-4 grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 md:grid-cols-[150px_1fr]">
                          <Field label="Self-rating (1–7)"><select value={rating} onChange={(e) => setRating(Number(e.target.value))} className={inputClass}>{[1,2,3,4,5,6,7].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
                          <Field label="Evidence-based justification"><textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} className={`${inputClass} min-h-24`} placeholder="Explain the current practice, supporting evidence, result, and remaining gap…" /></Field>
                          <p className="text-xs text-muted-foreground md:col-span-2">This internal rating requires a written justification and does not represent an official AUN-QA assessment result.</p>
                          <div className="flex justify-end gap-2 md:col-span-2"><Button variant="outline" onClick={() => setAssessmentFor(null)}>Cancel</Button><Button disabled={saving || narrative.trim().length < 20} onClick={() => void saveAssessment(requirement.code)}>Save self-assessment</Button></div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function percent(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-medium text-muted-foreground"><span>{label}</span>{children}</label>;
}

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="bg-card p-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>;
}

function StatusPill({ complete, completeText, emptyText }: { complete: boolean; completeText: string; emptyText: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${complete ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}{complete ? completeText : emptyText}</span>;
}

function ErrorNotice({ message }: { message: string }) {
  return <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>;
}
