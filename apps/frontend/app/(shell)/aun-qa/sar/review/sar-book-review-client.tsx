"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  QaContributorWorkspaceView,
  QaDashboardView,
  QaSarBookReviewReadinessView,
  QaSarBookSectionReviewDecision,
} from "@dse-pms/shared-types";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { SAR_BOOK_MODE_HREFS } from "../sar-book-navigation";

const PROGRAMME_ID = "dse";

export function SarBookReviewClient() {
  const { me, loading: meLoading } = useMe();
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<QaSarBookReviewReadinessView | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const leadershipOrReviewer =
    me?.roles.some((role) => ["admin", "program_coordinator", "qa_reviewer"].includes(role)) ?? false;
  const canReview = leadershipOrReviewer && (me?.permissions.includes("qa:review") ?? false);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      const selectedCycleId = leadershipOrReviewer
        ? (await api.get<QaDashboardView>(`/api/qa/dashboard?${params}`)).selectedCycle?.id ?? null
        : (await api.get<QaContributorWorkspaceView>(`/api/qa/workspace/my-work?${params}`)).selectedCycle?.id ?? null;
      setCycleId(selectedCycleId);
      if (!selectedCycleId) {
        setReadiness(null);
        return;
      }
      setReadiness(
        await api.get<QaSarBookReviewReadinessView>(
          `/api/qa/cycles/${selectedCycleId}/sar-book/review-readiness?${params}`,
        ),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load SAR book review readiness");
    } finally {
      setLoading(false);
    }
  }, [leadershipOrReviewer, me]);

  useEffect(() => {
    if (!meLoading && me) void load();
  }, [load, me, meLoading]);

  async function decide(
    sectionKey: string,
    revisionId: string,
    decision: QaSarBookSectionReviewDecision,
  ) {
    if (!cycleId || !canReview) return;
    const comment = comments[sectionKey]?.trim() ?? "";
    if (!comment) {
      setError("Add a review comment before recording a decision.");
      return;
    }
    setSavingKey(sectionKey);
    setError(null);
    try {
      await api.post(
        `/api/qa/cycles/${cycleId}/sar-book/sections/${encodeURIComponent(sectionKey)}/reviews`,
        { programmeId: PROGRAMME_ID, revisionId, decision, comment },
      );
      setComments((current) => ({ ...current, [sectionKey]: "" }));
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save SAR book review decision");
    } finally {
      setSavingKey(null);
    }
  }

  const blockerCounts = useMemo(() => {
    if (!readiness) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const blocker of readiness.blockers) {
      counts.set(blocker.part, (counts.get(blocker.part) ?? 0) + 1);
    }
    return counts;
  }, [readiness]);

  if (meLoading || loading) {
    return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Loading SAR review readiness…</div>;
  }
  if (!cycleId || !readiness) {
    return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">No accessible assessment cycle is available.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <header className="rounded-xl border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AUN-QA SAR · Book Review</div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Whole-book readiness</h1>
            <p className="mt-1 text-sm text-muted-foreground">{readiness.note}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-sm font-medium ${readiness.readyForFinalisation ? "bg-muted" : "text-destructive"}`}>
            {readiness.readyForFinalisation ? "Ready for finalisation preflight" : `${readiness.blockers.length} blocker(s)`}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(SAR_BOOK_MODE_HREFS).map(([mode, href]) => (
            <Link key={mode} href={href} className={`rounded-md border px-3 py-2 text-sm capitalize ${mode === "review" ? "bg-primary text-primary-foreground" : "bg-background"}`}>
              {mode}
            </Link>
          ))}
        </div>
      </header>

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {readiness.parts.map((part) => (
          <article key={part.part} className="rounded-xl border bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{part.part}</div>
            <h2 className="mt-1 font-semibold">{part.title}</h2>
            <div className="mt-3 text-2xl font-semibold">{part.ready}/{part.total}</div>
            <div className="mt-1 text-xs text-muted-foreground">ready · {blockerCounts.get(part.part) ?? 0} blocker(s)</div>
          </article>
        ))}
      </section>

      {readiness.blockers.length ? (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Finalisation preflight blockers</h2>
          <p className="mt-1 text-sm text-muted-foreground">All blockers are listed. This screen never partially finalises the SAR.</p>
          <ul className="mt-3 space-y-2">
            {readiness.blockers.map((blocker, index) => (
              <li key={`${blocker.type}-${blocker.sectionKey}-${blocker.requirementCode}-${index}`} className="rounded-md border p-3 text-sm">
                <span className="font-medium">{blocker.part.toUpperCase()}</span> · {blocker.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border bg-card p-4">
        <div>
          <h2 className="font-semibold">Shared section review</h2>
          <p className="mt-1 text-sm text-muted-foreground">Decisions attach to the exact current Part 1, 3 or 4 section revision. A later edit automatically requires a new review.</p>
        </div>
        <div className="mt-4 space-y-3">
          {readiness.staticSections.map((section) => (
            <article key={section.sectionKey} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{section.part} · {section.source}</div>
                  <h3 className="font-medium">{section.sectionTitle}</h3>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {section.revisionNumber ? `Revision ${section.revisionNumber}` : "No revision"} · {section.reviewStatus}
                  </div>
                </div>
                {section.latestReview ? (
                  <div className="max-w-sm rounded-md bg-muted p-2 text-xs">
                    <div className="font-medium">{section.latestReview.decision} by {section.latestReview.reviewer.name}</div>
                    <div className="mt-1 text-muted-foreground">{section.latestReview.comment}</div>
                  </div>
                ) : null}
              </div>
              {canReview && section.revisionId && section.contentReady ? (
                <div className="mt-3 border-t pt-3">
                  <label className="text-xs font-medium">
                    Review comment
                    <textarea
                      className="mt-1 min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                      value={comments[section.sectionKey] ?? ""}
                      onChange={(event) => setComments((current) => ({ ...current, [section.sectionKey]: event.target.value }))}
                      placeholder="Record the reason for approval or the exact changes requested."
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button disabled={savingKey === section.sectionKey} onClick={() => void decide(section.sectionKey, section.revisionId!, "approved")} className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">Approve revision</button>
                    <button disabled={savingKey === section.sectionKey} onClick={() => void decide(section.sectionKey, section.revisionId!, "changesRequested")} className="rounded-md border px-3 py-2 text-sm font-medium text-destructive disabled:opacity-50">Request changes</button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Part 2 requirement readiness</h2>
        <p className="mt-1 text-sm text-muted-foreground">Existing requirement submissions and reviews remain authoritative; this book view does not approve them.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {readiness.criteria.map((criterion) => (
            <div key={criterion.criterionCode} className="rounded-lg border p-3 text-sm">
              <div className="font-medium">Criterion {criterion.criterionCode} · {criterion.criterionTitle}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                {criterion.approved}/{criterion.total} approved · {criterion.pending} pending · {criterion.changesRequested} changes requested · {criterion.brokenEvidenceReferences} broken evidence reference(s)
              </div>
            </div>
          ))}
        </div>
        {canReview ? <Link href="/aun-qa/review" className="mt-4 inline-block rounded-md border px-3 py-2 text-sm font-medium">Open requirement review queue</Link> : null}
      </section>
    </div>
  );
}
