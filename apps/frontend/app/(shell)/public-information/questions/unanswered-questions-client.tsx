"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PublicQuestionEventRecord,
  PublicQuestionReviewState,
} from "@dse-pms/shared-types";
import { publicQuestionAnalyticsApi } from "@/lib/public-question-analytics";

const PROGRAMME_ID = "dse";
const STATES: Array<{ value: "" | PublicQuestionReviewState; label: string }> = [
  { value: "", label: "All" },
  { value: "Unreviewed", label: "Unreviewed" },
  { value: "Reviewed", label: "Reviewed" },
  { value: "Resolved", label: "Resolved" },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function UnansweredQuestionsClient() {
  const [items, setItems] = useState<PublicQuestionEventRecord[]>([]);
  const [retentionDays, setRetentionDays] = useState(180);
  const [state, setState] = useState<"" | PublicQuestionReviewState>("Unreviewed");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await publicQuestionAnalyticsApi.list(PROGRAMME_ID, {
        state: state || undefined,
        q: query || undefined,
      });
      setItems(result.items);
      setRetentionDays(result.retentionDays);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Ask DSE information gaps");
    } finally {
      setLoading(false);
    }
  }, [query, state]);

  useEffect(() => {
    void load();
  }, [load]);

  const repeated = useMemo(
    () => items.filter((item) => item.repeatCount > 1).length,
    [items],
  );

  async function updateState(item: PublicQuestionEventRecord, next: PublicQuestionReviewState) {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await publicQuestionAnalyticsApi.setReviewState(PROGRAMME_ID, item.id, next);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update review state");
    } finally {
      setBusyId(null);
    }
  }

  async function createFaqDraft(item: PublicQuestionEventRecord) {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      const result = await publicQuestionAnalyticsApi.createFaqDraft(PROGRAMME_ID, item.id);
      setNotice(
        result.created
          ? `FAQ draft created from “${item.questionTextSanitized}”. Open Public Information → FAQs to complete and publish it.`
          : `An FAQ draft already exists for this question. Open Public Information → FAQs to continue editing it.`,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create FAQ draft");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Ask DSE information gaps</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Only low-confidence suggestions and confirmed no-match questions are retained. Personal identifiers are not shown; question text is privacy-sanitized before storage.
          </p>
          <p className="mt-2 text-xs text-slate-500">Retention: {retentionDays} days.</p>
        </div>
        <Link
          href="/public-information"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to Public Information
        </Link>
      </div>

      <div className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_auto]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sanitized questions…"
          className="min-h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500"
        />
        <select
          value={state}
          onChange={(event) => setState(event.target.value as "" | PublicQuestionReviewState)}
          className="min-h-10 rounded-md border border-slate-300 px-3 text-sm"
        >
          {STATES.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full bg-slate-100 px-3 py-1">{items.length} shown</span>
        {repeated > 0 && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
            {repeated} repeated question{repeated === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">Loading information gaps…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
          No Ask DSE information gaps match this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{item.source}</span>
                    <span className={item.outcome === "None" ? "rounded-full bg-red-50 px-2.5 py-1 text-red-700" : "rounded-full bg-amber-50 px-2.5 py-1 text-amber-800"}>
                      {item.outcome === "None" ? "No match" : "Low confidence"}
                    </span>
                    {item.repeatCount > 1 && (
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                        Asked {item.repeatCount}×
                      </span>
                    )}
                    <span className="text-slate-500">{formatDate(item.createdAt)}</span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-slate-900">{item.questionTextSanitized}</h3>
                  <p className="mt-1 text-xs text-slate-500">Normalized: {item.normalizedQuestion}</p>
                  {item.suggestions.length > 0 && (
                    <div className="mt-3 text-sm text-slate-600">
                      <span className="font-medium text-slate-700">Closest published FAQs: </span>
                      {item.suggestions.map((suggestion) => `${suggestion.faqSlug} (${suggestion.score})`).join(", ")}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    Bot response delivered: {item.answerDelivered ? "Yes" : "No"} · State: {item.reviewState}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void createFaqDraft(item)}
                  className="rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
                >
                  Create FAQ draft
                </button>
                {item.reviewState !== "Reviewed" && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void updateState(item, "Reviewed")}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Mark reviewed
                  </button>
                )}
                {item.reviewState !== "Resolved" && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void updateState(item, "Resolved")}
                    className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    Resolve
                  </button>
                )}
                {item.reviewState !== "Unreviewed" && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void updateState(item, "Unreviewed")}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
