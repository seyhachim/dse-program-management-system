"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, FileWarning, LockKeyhole, RefreshCw } from "lucide-react";
import type {
  QaDashboardView,
  QaSarBookDocument,
  QaSarBookReleaseView,
  QaSarReleaseView,
} from "@dse-pms/shared-types";
import { DocumentRenderer } from "@/components/document-editor";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { parseStoredDocumentContent } from "@/lib/document-content";
import { exportSarBookDocx, exportSarBookPdf } from "./sar-book-export";
import { exportSarDocx as exportLegacySarDocx, exportSarPdf as exportLegacySarPdf } from "./sar-export";

const PROGRAMME_ID = "dse";
type PreviewMode = "working" | "official";

export function SarPreviewClient() {
  const { me, loading: meLoading } = useMe();
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [mode, setMode] = useState<PreviewMode>("working");
  const [model, setModel] = useState<QaSarBookDocument | null>(null);
  const [releases, setReleases] = useState<QaSarBookReleaseView[]>([]);
  const [legacyReleases, setLegacyReleases] = useState<QaSarReleaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canFinalize = me?.permissions.includes("qa:manage") ?? false;

  const load = useCallback(async (nextMode: PreviewMode = mode) => {
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
        setLegacyReleases([]);
        return;
      }
      const documentParams = new URLSearchParams({ programmeId: PROGRAMME_ID, mode: nextMode });
      const [document, releaseRows, legacyReleaseRows] = await Promise.all([
        api.get<QaSarBookDocument>(`/api/qa/cycles/${selectedCycleId}/sar-book/document?${documentParams}`),
        api.get<QaSarBookReleaseView[]>(`/api/qa/cycles/${selectedCycleId}/sar-book/releases?${params}`),
        api.get<QaSarReleaseView[]>(`/api/qa/cycles/${selectedCycleId}/sar-releases?${params}`),
      ]);
      setModel(document);
      setReleases(releaseRows);
      setLegacyReleases(legacyReleaseRows);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load SAR book preview");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!meLoading && me) void load(mode);
  }, [load, me, meLoading, mode]);

  async function changeMode(nextMode: PreviewMode) {
    setMode(nextMode);
    await load(nextMode);
  }

  async function finalize() {
    if (!cycleId || !model || model.mode !== "official") return;
    setFinalizing(true);
    setError(null);
    try {
      const release = await api.post<QaSarBookReleaseView>(
        `/api/qa/cycles/${cycleId}/sar-book/releases`,
        { programmeId: PROGRAMME_ID },
      );
      setModel(release.snapshot);
      setReleases((current) => [release, ...current.filter((item) => item.id !== release.id)]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not finalize official SAR book release");
    } finally {
      setFinalizing(false);
    }
  }

  if (meLoading || loading) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">Loading complete SAR book preview…</div>;
  }
  if (!model) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">No assessment cycle is available for SAR book preview.</div>;
  }

  const officialReady =
    model.mode === "official" &&
    model.readiness.readyForFinalisation &&
    model.part4.evidenceRegister.issues.length === 0;
  const releaseLabel = model.release
    ? `OFFICIAL RELEASE v${model.release.version}`
    : model.mode === "official"
      ? "OFFICIAL PREVIEW — NOT RELEASED"
      : "DRAFT PREVIEW";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{model.programme.code}</div>
            <h2 className="mt-1 text-xl font-semibold">{model.programme.name} — {model.cycle.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(model.cycle.reportingStart).toLocaleDateString()} – {new Date(model.cycle.reportingEnd).toLocaleDateString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/aun-qa/sar" className="rounded-md border px-3 py-2 text-sm">SAR Book</Link>
            <button onClick={() => void load(mode)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
            <button onClick={() => void exportSarBookDocx(model)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Download className="h-4 w-4" />DOCX</button>
            <button onClick={() => exportSarBookPdf(model)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Download className="h-4 w-4" />PDF</button>
            {canFinalize && model.mode === "official" ? (
              <button
                disabled={!officialReady || finalizing}
                onClick={() => void finalize()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                <LockKeyhole className="h-4 w-4" />{finalizing ? "Finalizing…" : "Finalize immutable release"}
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
          <button onClick={() => void changeMode("working")} className={`rounded-md px-3 py-2 text-sm font-medium ${!model.release && mode === "working" ? "bg-slate-900 text-white" : "border"}`}>Draft preview</button>
          <button onClick={() => void changeMode("official")} className={`rounded-md px-3 py-2 text-sm font-medium ${!model.release && mode === "official" ? "bg-slate-900 text-white" : "border"}`}>Official preview</button>
          <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${model.release ? "bg-emerald-100 text-emerald-800" : model.mode === "official" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>{releaseLabel}</span>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {model.readiness.parts.map((part) => <Metric key={part.part} label={part.title} value={`${part.ready}/${part.total}`} warning={part.blockers > 0} />)}
      </section>

      {model.release ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />This is an immutable release snapshot. Later SAR edits do not change this preview or its exports.
        </div>
      ) : officialReady ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />Readiness preflight is clean. Finalization will pin exact narrative revisions, approved requirement submissions, Part 3 state and the Evidence Register.</div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><FileWarning className="mt-0.5 h-4 w-4 shrink-0" /><div>{model.mode === "working" ? "Draft preview may contain in-progress content. " : "Official preview excludes unapproved requirement content. "}{model.readiness.blockers.length} readiness blocker(s) remain.</div></div>
      )}

      <article className="rounded-2xl border bg-white px-6 py-8 shadow-sm md:px-10">
        <header className="border-b pb-8 text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">SELF-ASSESSMENT REPORT</div>
          <h1 className="mt-3 text-3xl font-bold">{model.programme.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{model.cycle.title}</p>
          <div className="mt-4 text-xs font-semibold">{releaseLabel}</div>
          {model.release ? <div className="mt-2 text-xs text-muted-foreground">Finalized {new Date(model.release.finalizedAt).toLocaleString()} by {model.release.finalizedBy.name}</div> : null}
        </header>

        <section className="mt-8 border-b pb-8">
          <h2 className="text-xl font-bold">Table of Contents</h2>
          <div className="mt-4 space-y-1 text-sm">
            {model.toc.map((entry) => (
              <div key={entry.id} className={`flex gap-3 ${entry.level === 2 ? "pl-5" : entry.level === 3 ? "pl-10 text-muted-foreground" : "font-semibold"}`}>
                <span className="w-16 shrink-0 font-mono text-xs">{entry.number}</span><span>{entry.title}</span>
              </div>
            ))}
          </div>
        </section>

        <BookPart title="1 Part 1 — Introduction">
          {model.part1.sections.map((section) => <NarrativeSection key={section.sectionKey} number={section.number} title={section.title} content={section.content} revision={section.revisionNumber} />)}
        </BookPart>

        <BookPart title="2 Part 2 — AUN-QA Criteria">
          {model.part2.criteria.map((criterion) => (
            <section key={criterion.criterionId} className="space-y-5">
              <h3 className="text-lg font-bold">{criterion.number} Criterion {criterion.criterionCode}: {criterion.criterionTitle}</h3>
              {criterion.requirements.map((requirement) => (
                <div key={requirement.requirementId} className="border-l-2 border-slate-200 pl-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="font-semibold">{requirement.number} {requirement.requirementCode} {requirement.requirementTitle}</h4>
                    <span className="text-xs text-muted-foreground">{requirement.submissionVersion ? `Pinned submission v${requirement.submissionVersion}` : requirement.sourceKind ?? "No source"}</span>
                  </div>
                  <div className="mt-3 space-y-3 text-sm leading-7"><QaBlocks content={requirement.content} evidenceNumbers={new Map(model.part4.evidenceRegister.items.map((item) => [item.evidenceId, item.number]))} /></div>
                </div>
              ))}
            </section>
          ))}
        </BookPart>

        <BookPart title="3 Part 3 — Strengths and Weaknesses Analysis">
          <NarrativeSection number={model.part3.strengths.number} title={model.part3.strengths.title} content={model.part3.strengths.content} revision={model.part3.strengths.revisionNumber} />
          <NarrativeSection number={model.part3.weaknesses.number} title={model.part3.weaknesses.title} content={model.part3.weaknesses.content} revision={model.part3.weaknesses.revisionNumber} />
          <section>
            <h3 className="text-lg font-semibold">3.3 Self-Ratings</h3>
            <p className="mt-2 rounded-lg border bg-slate-50 p-3 text-sm text-muted-foreground">{model.part3.snapshot.note}</p>
            <div className="mt-4 space-y-4">
              {model.part3.snapshot.criteria.map((criterion) => (
                <div key={criterion.criterionId} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4"><div className="font-semibold">Criterion {criterion.criterionCode}: {criterion.criterionTitle}</div><div className="shrink-0 text-sm font-semibold">{criterion.rating ?? "—"}/7</div></div>
                  {criterion.opinion ? <p className="mt-2 whitespace-pre-wrap text-sm">{criterion.opinion}</p> : null}
                  <div className="mt-3 divide-y text-sm">{criterion.requirements.map((requirement) => <div key={requirement.requirementId} className="grid gap-1 py-2 md:grid-cols-[120px_70px_1fr]"><span className="font-medium">{requirement.requirementCode}</span><span>{requirement.rating ?? "—"}/7</span><span className="text-muted-foreground">{requirement.justification || "No justification"}</span></div>)}</div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="text-lg font-semibold">3.4 Improvement Plan</h3>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="py-2 pr-3">Requirement</th><th className="py-2 pr-3">Action</th><th className="py-2 pr-3">Indicator</th><th className="py-2 pr-3">Owner</th><th className="py-2">Status</th></tr></thead><tbody className="divide-y">{model.part3.snapshot.improvementActions.map((item) => <tr key={item.id}><td className="py-3 pr-3 font-medium">{item.requirementCode}</td><td className="py-3 pr-3">{item.plannedAction}</td><td className="py-3 pr-3">{item.indicator || "—"}</td><td className="py-3 pr-3">{item.ownerName ?? "—"}</td><td className="py-3">{item.status}</td></tr>)}{model.part3.snapshot.improvementActions.length === 0 ? <tr><td colSpan={5} className="py-5 text-center text-muted-foreground">No improvement actions.</td></tr> : null}</tbody></table></div>
          </section>
        </BookPart>

        <BookPart title="4 Part 4 — Appendices">
          <NarrativeSection number={model.part4.glossary.number} title={model.part4.glossary.title} content={model.part4.glossary.content} revision={model.part4.glossary.revisionNumber} />
          <section>
            <h3 className="text-lg font-semibold">4.2 {model.part4.evidenceRegister.terminology.evidenceRegisterTitle}</h3>
            <EvidenceTable model={model} />
          </section>
          <section>
            <h3 className="text-lg font-semibold">4.3 Supporting Documents</h3>
            <ul className="mt-3 space-y-1 text-sm">{model.part4.evidenceRegister.items.map((item) => <li key={item.evidenceId}>{item.number} — {item.title}</li>)}</ul>
          </section>
        </BookPart>
      </article>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Official SAR Book releases</h2>
        <p className="mt-1 text-sm text-muted-foreground">Exports below are rendered only from the stored immutable full-book snapshot, never from current live SAR data.</p>
        <div className="mt-3 space-y-2">
          {releases.map((release) => (
            <div key={release.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div><span className="font-medium">Release v{release.version}</span> · {release.title}<div className="text-xs text-muted-foreground">{release.submissionIds.length} pinned Part 2 submissions · finalized by {release.finalizedBy.name}</div></div>
              <div className="flex gap-2"><button onClick={() => setModel(release.snapshot)} className="rounded-md border px-2 py-1 text-xs">View</button><button onClick={() => void exportSarBookDocx(release.snapshot)} className="rounded-md border px-2 py-1 text-xs">DOCX</button><button onClick={() => exportSarBookPdf(release.snapshot)} className="rounded-md border px-2 py-1 text-xs">PDF</button></div>
            </div>
          ))}
          {releases.length === 0 ? <div className="text-sm text-muted-foreground">No official SAR Book release has been created yet.</div> : null}
        </div>
      </section>

      {legacyReleases.length > 0 ? (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Historical legacy SAR releases</h2>
          <p className="mt-1 text-sm text-muted-foreground">These immutable releases were created by the earlier Part-2-only SAR document workflow. They remain readable and exportable without being rewritten into the new full-book format.</p>
          <div className="mt-3 space-y-3">
            {legacyReleases.map((release) => (
              <div key={release.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="font-medium">Legacy release v{release.version}</span> · {release.title}
                    <div className="text-xs text-muted-foreground">{release.submissionIds.length} pinned requirement submissions · finalized by {release.finalizedBy.name} · {new Date(release.finalizedAt).toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => void exportLegacySarDocx(release.snapshot, `${release.title}-v${release.version}-legacy`)} className="rounded-md border px-2 py-1 text-xs">DOCX</button>
                    <button onClick={() => exportLegacySarPdf(release.snapshot, `${release.title}-v${release.version}-legacy`)} className="rounded-md border px-2 py-1 text-xs">PDF</button>
                  </div>
                </div>
                <details className="mt-3 rounded-md bg-slate-50 p-3">
                  <summary className="cursor-pointer text-xs font-semibold">View legacy content</summary>
                  <div className="mt-3 space-y-4">
                    {release.snapshot.criteria.map((criterion) => (
                      <section key={criterion.code}>
                        <h3 className="font-semibold">Criterion {criterion.code}: {criterion.title}</h3>
                        <div className="mt-2 space-y-3">
                          {criterion.sections.map((section) => (
                            <div key={section.requirementCode} className="border-l-2 border-slate-200 pl-3">
                              <div className="text-xs font-medium">{section.requirementCode} {section.requirementTitle}</div>
                              <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{section.plainText || "No stored narrative text."}</div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </details>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value, warning }: { label: string; value: string; warning: boolean }) {
  return <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm text-muted-foreground">{label}</div><div className={`mt-2 text-2xl font-semibold ${warning ? "text-amber-700" : ""}`}>{value}</div></div>;
}

function BookPart({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-10 space-y-7 border-t pt-8"><h2 className="text-xl font-bold">{title}</h2>{children}</section>;
}

function NarrativeSection({ number, title, content, revision }: { number: string; title: string; content: string; revision: number | null }) {
  return <section><div className="flex items-baseline justify-between gap-3"><h3 className="text-lg font-semibold">{number} {title}</h3><span className="text-xs text-muted-foreground">{revision ? `Revision ${revision}` : "No revision"}</span></div><div className="mt-3 rounded-lg border p-4"><DocumentRenderer value={parseStoredDocumentContent(content)} /></div></section>;
}

function QaBlocks({ content, evidenceNumbers }: { content: QaSarBookDocument["part2"]["criteria"][number]["requirements"][number]["content"]; evidenceNumbers: Map<string, string> }) {
  if (!content) return <div className="rounded-lg border border-dashed bg-slate-50 p-4 text-muted-foreground">No included source content.</div>;
  return <>{content.blocks.map((block) => {
    if (block.type === "richText") return <DocumentRenderer key={block.id} value={parseStoredDocumentContent(block.content)} />;
    if (block.type === "heading") return <h5 key={block.id} className="font-semibold">{block.text}</h5>;
    if (block.type === "bullet") return <div key={block.id} className="flex gap-2"><span>•</span><span>{block.text}</span></div>;
    if (block.type === "evidenceReference") return <div key={block.id} className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">[{evidenceNumbers.get(block.evidenceId) ?? "Evidence"}] {block.label}</div>;
    if (block.type === "pmsData") return <div key={block.id} className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-violet-800">[PMS data] {block.label}</div>;
    return <p key={block.id} className="whitespace-pre-wrap">{block.text}</p>;
  })}</>;
}

function EvidenceTable({ model }: { model: QaSarBookDocument }) {
  return <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="py-2 pr-3">Exhibit</th><th className="py-2 pr-3">Evidence</th><th className="py-2 pr-3">Period</th><th className="py-2 pr-3">Used in</th><th className="py-2">Source</th></tr></thead><tbody className="divide-y">{model.part4.evidenceRegister.items.map((item) => <tr key={item.evidenceId}><td className="py-3 pr-3 font-mono text-xs">{item.number}</td><td className="py-3 pr-3 font-medium">{item.title}</td><td className="py-3 pr-3">{item.reportingPeriod || "—"}</td><td className="py-3 pr-3">{item.usages.map((usage) => usage.requirementCode ?? usage.sectionTitle).join(", ")}</td><td className="py-3">{item.sourceUrl ?? item.sourceRef ?? "—"}</td></tr>)}{model.part4.evidenceRegister.items.length === 0 ? <tr><td colSpan={5} className="py-5 text-center text-muted-foreground">No evidence is included.</td></tr> : null}</tbody></table></div>;
}