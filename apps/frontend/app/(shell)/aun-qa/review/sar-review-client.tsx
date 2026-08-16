"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileCheck2, MessageSquareWarning, RefreshCw } from "lucide-react";
import type {
  QaSarReviewDecision,
  QaSarReviewQueueView,
  QaSarSubmissionView,
} from "@dse-pms/shared-types";
import { ApiError, api } from "@/lib/api";

const PROGRAMME_ID = "dse";

export function SarReviewClient() {
  const [queue, setQueue] = useState<QaSarReviewQueueView | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      setQueue(await api.get<QaSarReviewQueueView>(`/api/qa/sar-review-queue?${params}`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the SAR review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(submission: QaSarSubmissionView, decision: QaSarReviewDecision) {
    const comment = (comments[submission.id] ?? "").trim();
    if (decision !== "approved" && !comment) {
      setError("Add a reviewer comment before requesting changes or more evidence.");
      return;
    }
    setBusy(submission.id);
    setError(null);
    try {
      await api.post(`/api/qa/sar-submissions/${submission.id}/reviews`, {
        programmeId: PROGRAMME_ID,
        decision,
        comment,
      });
      setComments((current) => ({ ...current, [submission.id]: "" }));
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the SAR review decision");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">Loading SAR review queue…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Sections waiting for human review</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review the submitted snapshot and its evidence references. Decisions do not create AUN-QA scores or accreditation outcomes.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/aun-qa" className="rounded-md border px-3 py-2 text-sm">Workspace</Link>
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {queue?.submissions.length ? (
        queue.submissions.map((submission) => (
          <article key={submission.id} className="rounded-2xl border bg-white shadow-sm">
            <div className="border-b p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-primary">{submission.requirementCode} · Criterion {submission.criterionCode}</div>
                  <h3 className="mt-1 text-lg font-semibold">{submission.requirementTitle}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Submission v{submission.version} · submitted by {submission.submittedBy.name} · {new Date(submission.submittedAt).toLocaleString()}</p>
                </div>
                <Link href={`/aun-qa/sar/${submission.requirementCode}`} className="text-sm font-medium text-primary hover:underline">Open requirement</Link>
              </div>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submitted narrative</div>
                <div className="mt-3 whitespace-pre-wrap rounded-xl border bg-slate-50 p-4 text-sm leading-7 text-slate-800">{submission.plainText}</div>

                <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Structured grounding</div>
                <div className="mt-2 space-y-2">
                  {submission.content.blocks.filter((block) => block.type === "evidenceReference" || block.type === "pmsData").map((block) => (
                    <div key={block.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${block.type === "evidenceReference" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-violet-200 bg-violet-50 text-violet-800"}`}>
                      <FileCheck2 className="h-4 w-4" />
                      {block.type === "evidenceReference" ? `Evidence: ${block.label}` : `PMS data: ${block.label}`}
                    </div>
                  ))}
                  {submission.evidenceIds.length === 0 ? <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No explicit evidence references were included in this submission.</div> : null}
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-xl border p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Author readiness</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <ReadinessRow label="Practice/process" ready={submission.readiness.practiceDescribed} />
                    <ReadinessRow label="Results/findings" ready={submission.readiness.resultsAnalysed} />
                    <ReadinessRow label="Improvement/action" ready={submission.readiness.improvementExplained} />
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <label className="text-sm font-medium">Reviewer comment</label>
                  <textarea
                    value={comments[submission.id] ?? ""}
                    onChange={(event) => setComments((current) => ({ ...current, [submission.id]: event.target.value }))}
                    rows={5}
                    placeholder="Explain requested changes or evidence needs. Optional for approval."
                    className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
                  />
                  <div className="mt-3 grid gap-2">
                    <button disabled={busy === submission.id} onClick={() => void decide(submission, "approved")} className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Approve section</button>
                    <button disabled={busy === submission.id} onClick={() => void decide(submission, "changesRequested")} className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 disabled:opacity-50"><MessageSquareWarning className="h-4 w-4" />Request changes</button>
                    <button disabled={busy === submission.id} onClick={() => void decide(submission, "moreEvidenceRequested")} className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">Ask for more evidence</button>
                  </div>
                </div>
              </aside>
            </div>
          </article>
        ))
      ) : (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
          <h3 className="mt-3 font-semibold">No SAR sections are waiting for review</h3>
          <p className="mt-1 text-sm text-muted-foreground">New submissions will appear here after contributors submit them.</p>
        </div>
      )}
    </div>
  );
}

function ReadinessRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs ${ready ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{ready ? "Confirmed" : "Not confirmed"}</span>
    </div>
  );
}
