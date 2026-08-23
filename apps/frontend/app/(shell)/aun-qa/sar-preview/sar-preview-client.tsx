"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileWarning, LockKeyhole, RefreshCw } from "lucide-react";
import type {
  QaDashboardView,
  QaSarDocumentModelView,
  QaSarDocumentMode,
  QaSarReleaseView,
} from "@dse-pms/shared-types";
import { DocumentRenderer } from "@/components/document-editor";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  buildSarDocumentLayout,
  type SarLayoutBlock,
} from "./sar-document-layout";
import { exportSarDocx, exportSarPdf } from "./sar-export";

const PROGRAMME_ID = "dse";

export function SarPreviewClient() {
  const { me, loading: meLoading } = useMe();
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [mode, setMode] = useState<QaSarDocumentMode>("working");
  const [model, setModel] = useState<QaSarDocumentModelView | null>(null);
  const [releases, setReleases] = useState<QaSarReleaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canFinalize = me?.permissions.includes("qa:manage") ?? false;

  const load = useCallback(async (nextMode: QaSarDocumentMode = mode) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      const dashboard = await api.get<QaDashboardView>(`/api/qa/dashboard?${params}`);
      const selectedCycleId = dashboard.selectedCycle?.id ?? null;
      setCycleId(selectedCycleId);
      if (!selectedCycleId) {
        setModel(null);
        setReleases([]);
        return;
      }
      const documentParams = new URLSearchParams({ programmeId: PROGRAMME_ID, mode: nextMode });
      const [document, releaseRows] = await Promise.all([
        api.get<QaSarDocumentModelView>(`/api/qa/cycles/${selectedCycleId}/sar-document?${documentParams}`),
        api.get<QaSarReleaseView[]>(`/api/qa/cycles/${selectedCycleId}/sar-releases?${params}`),
      ]);
      setModel(document);
      setReleases(releaseRows);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load SAR preview");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!meLoading && me) void load(mode);
  }, [load, me, meLoading, mode]);

  async function changeMode(nextMode: QaSarDocumentMode) {
    setMode(nextMode);
    await load(nextMode);
  }

  async function finalize() {
    if (!cycleId || !model || model.mode !== "official") return;
    setFinalizing(true);
    setError(null);
    try {
      await api.post(`/api/qa/cycles/${cycleId}/sar-document/finalize`, {
        programmeId: PROGRAMME_ID,
      });
      await load("official");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not finalize official SAR");
    } finally {
      setFinalizing(false);
    }
  }

  if (meLoading || loading) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">Loading SAR preview…</div>;
  }

  if (!model) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">No assessment cycle is available for SAR preview.</div>;
  }

  const layout = buildSarDocumentLayout(model);
  const officialReady = model.mode === "official" && model.totals.missingSections === 0 && model.totals.requiredSections > 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{model.programmeCode}</div>
            <h2 className="mt-1 text-xl font-semibold">{model.programmeName} — {model.cycleTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(model.reportingStart).toLocaleDateString()} – {new Date(model.reportingEnd).toLocaleDateString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/aun-qa" className="rounded-md border px-3 py-2 text-sm">Workspace</Link>
            <button onClick={() => void load(mode)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
            <button onClick={() => void exportSarDocx(model)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Download className="h-4 w-4" />DOCX</button>
            <button onClick={() => exportSarPdf(model)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Download className="h-4 w-4" />PDF</button>
            {canFinalize && model.mode === "official" ? (
              <button
                disabled={!officialReady || finalizing}
                onClick={() => void finalize()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                <LockKeyhole className="h-4 w-4" />{finalizing ? "Finalizing…" : "Finalize release"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex gap-2 border-t pt-4">
          <button onClick={() => void changeMode("working")} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "working" ? "bg-slate-900 text-white" : "border"}`}>Working SAR</button>
          <button onClick={() => void changeMode("official")} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "official" ? "bg-slate-900 text-white" : "border"}`}>Official SAR</button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Required sections" value={model.totals.requiredSections} />
        <Metric label="Included" value={model.totals.includedSections} />
        <Metric label="Approved" value={model.totals.approvedSections} />
        <Metric label="Missing" value={model.totals.missingSections} warning={model.totals.missingSections > 0} />
      </section>

      {mode === "working" ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Working SAR includes current drafts and review-state content. It is for coordination and may change as authors continue editing.
        </div>
      ) : officialReady ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />Every required section has an approved immutable submission. This official draft can be finalized.</div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><FileWarning className="h-4 w-4" />Official mode excludes unapproved work. {model.totals.missingSections} required section(s) still need an approved submission.</div>
      )}

      <article className="rounded-2xl border bg-white px-6 py-8 shadow-sm md:px-10">
        <header className="border-b pb-6 text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{layout.title}</div>
          <h1 className="mt-3 text-2xl font-bold">{layout.programmeName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{layout.cycleTitle}</p>
          <div className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${layout.mode === "working" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
            {layout.modeLabel}
          </div>
        </header>

        <div className="mt-8 space-y-10">
          {layout.criteria.map((criterion) => (
            <section key={criterion.code}>
              <h2 className="text-xl font-bold">Criterion {criterion.code}: {criterion.title}</h2>
              <div className="mt-5 space-y-7">
                {criterion.sections.map((section) => (
                  <div key={section.requirementCode} className="border-l-2 border-slate-200 pl-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-semibold">{section.requirementCode} {section.requirementTitle}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${section.status === "approved" ? "bg-emerald-50 text-emerald-700" : section.status === "missing" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>{section.statusLabel}</span>
                    </div>
                    {section.missingMessage ? (
                      <div className="mt-3 rounded-lg border border-dashed bg-slate-50 p-4 text-sm text-muted-foreground">{section.missingMessage}</div>
                    ) : (
                      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-800">
                        {section.blocks.map((block) => <RenderedBlock key={block.id} block={block} />)}
                      </div>
                    )}
                    {section.submissionLabel ? <div className="mt-2 text-[11px] text-muted-foreground">{section.submissionLabel}</div> : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-12 border-t pt-8">
          <h2 className="text-xl font-bold">Evidence Register</h2>
          <p className="mt-1 text-sm text-muted-foreground">Canonical evidence is listed once even when reused across multiple requirements.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-4">Evidence</th><th className="py-2 pr-4">Period</th><th className="py-2 pr-4">Used in</th><th className="py-2">Source</th></tr></thead>
              <tbody className="divide-y">
                {layout.evidenceRows.map((item) => (
                  <tr key={item.evidenceId}>
                    <td className="py-3 pr-4"><span className="font-mono text-xs text-muted-foreground">{item.number}</span> <span className="font-medium">{item.title}</span></td>
                    <td className="py-3 pr-4">{item.reportingPeriod}</td>
                    <td className="py-3 pr-4">{item.requirementCodes}</td>
                    <td className="py-3">{item.source}</td>
                  </tr>
                ))}
                {layout.evidenceRows.length === 0 ? <tr><td colSpan={4} className="py-5 text-center text-muted-foreground">No explicit evidence references are included in this document.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </article>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Final releases</h2>
        <p className="mt-1 text-sm text-muted-foreground">Each release is an immutable snapshot pinned to exact approved submission versions.</p>
        <div className="mt-3 space-y-2">
          {releases.map((release) => (
            <div key={release.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div><span className="font-medium">Release v{release.version}</span> · {release.title}<div className="text-xs text-muted-foreground">Finalized by {release.finalizedBy.name} · {new Date(release.finalizedAt).toLocaleString()}</div></div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{release.submissionIds.length} pinned sections</span>
                <button onClick={() => void exportSarDocx(release.snapshot, `${release.title}-v${release.version}`)} className="rounded-md border px-2 py-1 text-xs">DOCX</button>
                <button onClick={() => exportSarPdf(release.snapshot, `${release.title}-v${release.version}`)} className="rounded-md border px-2 py-1 text-xs">PDF</button>
              </div>
            </div>
          ))}
          {releases.length === 0 ? <div className="text-sm text-muted-foreground">No final release has been created yet.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm text-muted-foreground">{label}</div><div className={`mt-2 text-2xl font-semibold ${warning ? "text-amber-700" : ""}`}>{value}</div></div>;
}

function RenderedBlock({ block }: { block: SarLayoutBlock }) {
  if (block.type === "richText") return <DocumentRenderer value={block.document} />;
  if (block.type === "heading") return <h4 className={block.level === 2 ? "text-lg font-semibold" : "font-semibold"}>{block.text}</h4>;
  if (block.type === "bullet") return <div className="flex gap-2"><span>•</span><p>{block.text}</p></div>;
  if (block.type === "evidenceReference") return <span className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">{block.text}</span>;
  if (block.type === "pmsData") return <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">{block.text}</div>;
  return <p className="whitespace-pre-wrap">{block.text}</p>;
}
