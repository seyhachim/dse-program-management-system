"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileCheck2, Link2, Pencil, Plus, Search, Unlink2 } from "lucide-react";
import type {
  QaContributorWorkspaceView,
  QaDashboardView,
  QaEvidenceItemView,
} from "@dse-pms/shared-types";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";

const PROGRAMME_ID = "dse";
type EvidenceKind = "systemLink" | "externalLink" | "document";
type EvidenceStatus = "draft" | "ready" | "reviewed";
type RequirementOption = { code: string; title: string };

type EvidenceForm = {
  title: string;
  description: string;
  kind: EvidenceKind;
  sourceUrl: string;
  sourceRef: string;
  reportingPeriod: string;
  status: EvidenceStatus;
};

const EMPTY_FORM: EvidenceForm = {
  title: "",
  description: "",
  kind: "document",
  sourceUrl: "",
  sourceRef: "",
  reportingPeriod: "",
  status: "draft",
};

export function EvidenceLibraryClient() {
  const { me, loading: meLoading } = useMe();
  const [items, setItems] = useState<QaEvidenceItemView[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<RequirementOption[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<EvidenceForm>(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mappingChoice, setMappingChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManageMetadata = me?.permissions.includes("qa:manage") ?? false;
  const leadershipOrReviewer =
    me?.roles.some((role) => ["admin", "program_coordinator", "qa_reviewer"].includes(role)) ?? false;

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      const evidencePromise = api.get<QaEvidenceItemView[]>(`/api/qa/evidence-library?${params}`);

      if (leadershipOrReviewer) {
        const dashboard = await api.get<QaDashboardView>(`/api/qa/dashboard?${params}`);
        setCycleId(dashboard.selectedCycle?.id ?? null);
        setRequirements(
          dashboard.criteria.flatMap((criterion) =>
            criterion.requirements.map((requirement) => ({
              code: requirement.code,
              title: requirement.title,
            })),
          ),
        );
      } else {
        const workspace = await api.get<QaContributorWorkspaceView>(`/api/qa/workspace/my-work?${params}`);
        setCycleId(workspace.selectedCycle?.id ?? null);
        setRequirements(
          workspace.work.map((item) => ({
            code: item.assignment.requirementCode,
            title: item.assignment.requirementTitle,
          })),
        );
      }

      setItems(await evidencePromise);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the Evidence Library");
    } finally {
      setLoading(false);
    }
  }, [leadershipOrReviewer, me]);

  useEffect(() => {
    if (!meLoading && me) void load();
  }, [load, me, meLoading]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.title, item.description, item.sourceRef, item.reportingPeriod, ...item.mappings.map((mapping) => mapping.requirementCode)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [items, query]);

  const duplicateHints = useMemo(() => {
    const title = form.title.trim().toLowerCase();
    if (title.length < 4) return [];
    return items.filter((item) => item.title.toLowerCase().includes(title) || title.includes(item.title.toLowerCase())).slice(0, 3);
  }, [form.title, items]);

  function payload(values: EvidenceForm) {
    return { programmeId: PROGRAMME_ID, ...values };
  }

  async function saveNew() {
    setBusy("create");
    setError(null);
    try {
      await api.post<QaEvidenceItemView>("/api/qa/evidence-library", payload(form));
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not add evidence");
    } finally {
      setBusy(null);
    }
  }

  function beginEdit(item: QaEvidenceItemView) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      description: item.description,
      kind: item.kind,
      sourceUrl: item.sourceUrl ?? "",
      sourceRef: item.sourceRef,
      reportingPeriod: item.reportingPeriod,
      status: item.status,
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(editingId);
    setError(null);
    try {
      await api.put<QaEvidenceItemView>(`/api/qa/evidence-library/${editingId}`, payload(form));
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update evidence metadata");
    } finally {
      setBusy(null);
    }
  }

  async function linkEvidence(item: QaEvidenceItemView) {
    if (!cycleId) return;
    const requirementCode = mappingChoice[item.id];
    if (!requirementCode) return;
    setBusy(`map:${item.id}`);
    setError(null);
    try {
      await api.put(`/api/qa/cycles/${cycleId}/evidence/${item.id}/mapping`, {
        programmeId: PROGRAMME_ID,
        requirementCode,
        relevanceNote: "",
      });
      setMappingChoice((current) => ({ ...current, [item.id]: "" }));
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not link evidence");
    } finally {
      setBusy(null);
    }
  }

  async function unlinkEvidence(item: QaEvidenceItemView, requirementCode: string) {
    if (!cycleId) return;
    setBusy(`unmap:${item.id}:${requirementCode}`);
    setError(null);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      await api.delete(`/api/qa/cycles/${cycleId}/evidence/${item.id}/mapping/${requirementCode}?${params}`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not unlink evidence");
    } finally {
      setBusy(null);
    }
  }

  if (meLoading || loading) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">Loading Evidence Library…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">One evidence item, many AUN-QA uses</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Search before adding a new item. Link the same survey, minutes, policy, or report to every requirement it genuinely supports instead of uploading copies.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/aun-qa" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Back to workspace</Link>
            <button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setShowCreate((value) => !value); }} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              <Plus className="h-4 w-4" /> Add evidence
            </button>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {showCreate ? (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Add canonical evidence</h3>
          <EvidenceFormFields form={form} onChange={setForm} />
          {duplicateHints.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="font-medium">Possible existing evidence</div>
              {duplicateHints.map((item) => <div key={item.id} className="mt-1">• {item.title} {item.reportingPeriod ? `(${item.reportingPeriod})` : ""}</div>)}
              <div className="mt-2 text-xs">Reuse an existing item when it is the same source.</div>
            </div>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="rounded-md border px-3 py-2 text-sm">Cancel</button>
            <button disabled={busy === "create" || !form.title.trim()} onClick={() => void saveNew()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Save evidence</button>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, source, reporting period, or requirement…" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm" />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {filtered.map((item) => {
          const currentMappings = item.mappings.filter((mapping) => !cycleId || mapping.cycleId === cycleId);
          const mappedCodes = new Set(currentMappings.map((mapping) => mapping.requirementCode));
          const availableRequirements = requirements.filter((requirement) => !mappedCodes.has(requirement.code));
          const isEditing = editingId === item.id;
          return (
            <article key={item.id} className="rounded-2xl border bg-white p-5 shadow-sm">
              {isEditing ? (
                <>
                  <EvidenceFormFields form={form} onChange={setForm} />
                  <div className="mt-4 flex justify-end gap-2">
                    <button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }} className="rounded-md border px-3 py-2 text-sm">Cancel</button>
                    <button disabled={busy === item.id} onClick={() => void saveEdit()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Save changes</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <FileCheck2 className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold">{item.title}</h3>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{item.status}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{item.description || "No description yet."}</p>
                    </div>
                    {canManageMetadata ? <button onClick={() => beginEdit(item)} className="rounded-md border p-2" aria-label={`Edit ${item.title}`}><Pencil className="h-4 w-4" /></button> : null}
                  </div>

                  <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <div><span className="font-medium text-foreground">Type:</span> {item.kind}</div>
                    <div><span className="font-medium text-foreground">Period:</span> {item.reportingPeriod || "—"}</div>
                    <div className="sm:col-span-2"><span className="font-medium text-foreground">Source:</span> {item.sourceRef || item.sourceUrl || "—"}</div>
                  </div>

                  <div className="mt-5 border-t pt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Used in this cycle</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {currentMappings.length === 0 ? <span className="text-sm text-muted-foreground">Not linked yet.</span> : currentMappings.map((mapping) => (
                        <span key={mapping.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          {mapping.requirementCode}
                          <button disabled={busy === `unmap:${item.id}:${mapping.requirementCode}`} onClick={() => void unlinkEvidence(item, mapping.requirementCode)} aria-label={`Unlink ${mapping.requirementCode}`}><Unlink2 className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>

                    {cycleId && availableRequirements.length > 0 ? (
                      <div className="mt-3 flex gap-2">
                        <select value={mappingChoice[item.id] ?? ""} onChange={(event) => setMappingChoice((current) => ({ ...current, [item.id]: event.target.value }))} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm">
                          <option value="">Link to requirement…</option>
                          {availableRequirements.map((requirement) => <option key={requirement.code} value={requirement.code}>{requirement.code} — {requirement.title}</option>)}
                        </select>
                        <button disabled={!mappingChoice[item.id] || busy === `map:${item.id}`} onClick={() => void linkEvidence(item)} className="inline-flex items-center gap-1 rounded-md border px-3 text-sm font-medium disabled:opacity-50"><Link2 className="h-4 w-4" /> Link</button>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </article>
          );
        })}
      </section>

      {filtered.length === 0 ? <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">No evidence matches your search.</div> : null}
    </div>
  );
}

function EvidenceFormFields({ form, onChange }: { form: EvidenceForm; onChange: (value: EvidenceForm) => void }) {
  const set = <K extends keyof EvidenceForm>(key: K, value: EvidenceForm[K]) => onChange({ ...form, [key]: value });
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <label className="text-sm md:col-span-2">Title<input value={form.title} onChange={(event) => set("title", event.target.value)} className="mt-1 h-9 w-full rounded-md border px-3" /></label>
      <label className="text-sm md:col-span-2">Description<textarea value={form.description} onChange={(event) => set("description", event.target.value)} rows={3} className="mt-1 w-full rounded-md border px-3 py-2" /></label>
      <label className="text-sm">Type<select value={form.kind} onChange={(event) => set("kind", event.target.value as EvidenceKind)} className="mt-1 h-9 w-full rounded-md border px-2"><option value="document">Document</option><option value="externalLink">External link</option><option value="systemLink">PMS/system link</option></select></label>
      <label className="text-sm">Status<select value={form.status} onChange={(event) => set("status", event.target.value as EvidenceStatus)} className="mt-1 h-9 w-full rounded-md border px-2"><option value="draft">Draft</option><option value="ready">Ready</option><option value="reviewed">Reviewed</option></select></label>
      <label className="text-sm">Reporting period<input value={form.reportingPeriod} onChange={(event) => set("reportingPeriod", event.target.value)} placeholder="2025-26" className="mt-1 h-9 w-full rounded-md border px-3" /></label>
      <label className="text-sm">System/source reference<input value={form.sourceRef} onChange={(event) => set("sourceRef", event.target.value)} placeholder="Programme Office / PMS route" className="mt-1 h-9 w-full rounded-md border px-3" /></label>
      <label className="text-sm md:col-span-2">Source URL<input value={form.sourceUrl} onChange={(event) => set("sourceUrl", event.target.value)} placeholder="https://…" className="mt-1 h-9 w-full rounded-md border px-3" /></label>
    </div>
  );
}
