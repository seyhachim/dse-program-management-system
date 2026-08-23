"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { TelegramAnalyticsDashboard } from "@dse-pms/shared-types";
import { telegramAnalyticsApi } from "@/lib/telegram-analytics";

const PROGRAMME_ID = "dse";
const RANGES = [7, 30, 90] as const;

function eventLabel(value: string): string {
  return value
    .replace(/Viewed$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^Mini App Opened$/, "Mini App opens");
}

function roleLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function MetricCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value.toLocaleString()}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function TelegramAnalyticsClient() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<TelegramAnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await telegramAnalyticsApi.dashboard(PROGRAMME_ID, days));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Telegram analytics");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Telegram usage & question analytics</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Aggregate product usage for the authenticated Mini App plus privacy-sanitized Ask DSE information gaps. This data is analytics only and never affects attendance, grades, enrollment, permissions, or academic records.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            No Telegram usernames, raw Telegram IDs, phone numbers, client IPs, session tokens, or limiter state are exposed here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/public-information/questions"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Review Ask DSE gaps
          </Link>
          <Link
            href="/public-information"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to Public Information
          </Link>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <label htmlFor="telegram-analytics-range" className="text-sm font-medium text-slate-700">
            Period
          </label>
          <select
            id="telegram-analytics-range"
            value={days}
            onChange={(event) => setDays(Number(event.target.value) as (typeof RANGES)[number])}
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          >
            {RANGES.map((range) => (
              <option key={range} value={range}>Last {range} days</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Refresh
        </button>
      </section>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">Loading Telegram analytics…</div>
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Mini App opens" value={data.miniApp.opens} hint={`Last ${data.periodDays} days`} />
            <MetricCard label="Unique PMS users" value={data.miniApp.uniqueUsers} hint="Distinct authenticated users" />
            <MetricCard label="Feature views" value={data.miniApp.totalEvents} hint="Meaningful read events only" />
            <MetricCard label="Ask DSE gaps" value={data.askDse.informationGapQuestions} hint="Low-confidence + no-match only" />
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Most-used Mini App areas</h3>
              <p className="mt-1 text-xs text-slate-500">Successful read views; mutations are intentionally excluded.</p>
              <div className="mt-4 space-y-3">
                {data.miniApp.topEvents.length === 0 ? (
                  <p className="text-sm text-slate-500">No Mini App usage recorded in this period.</p>
                ) : data.miniApp.topEvents.map((item) => (
                  <div key={item.eventType} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                    <span className="text-sm text-slate-700">{eventLabel(item.eventType)}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Usage by PMS role</h3>
              <p className="mt-1 text-xs text-slate-500">Aggregate counts only; individual users are not listed.</p>
              <div className="mt-4 space-y-3">
                {data.miniApp.roleBreakdown.length === 0 ? (
                  <p className="text-sm text-slate-500">No role usage recorded in this period.</p>
                ) : data.miniApp.roleBreakdown.map((item) => (
                  <div key={item.role} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{roleLabel(item.role)}</p>
                      <p className="text-xs text-slate-500">{item.uniqueUsers} unique user{item.uniqueUsers === 1 ? "" : "s"}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">{item.eventCount} views</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Ask DSE information gaps</h3>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-2xl font-semibold text-amber-900">{data.askDse.lowConfidence}</p>
                  <p className="mt-1 text-xs text-amber-800">Low confidence</p>
                </div>
                <div className="rounded-lg bg-red-50 p-3">
                  <p className="text-2xl font-semibold text-red-900">{data.askDse.noMatch}</p>
                  <p className="mt-1 text-xs text-red-800">No match</p>
                </div>
                <div className="rounded-lg bg-slate-100 p-3">
                  <p className="text-2xl font-semibold text-slate-900">{data.askDse.unresolved}</p>
                  <p className="mt-1 text-xs text-slate-600">Unresolved</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">Top unresolved questions</h3>
                  <p className="mt-1 text-xs text-slate-500">Stored text is sanitized before analytics persistence.</p>
                </div>
                <Link href="/public-information/questions" className="text-sm font-medium text-sky-700 hover:text-sky-800">
                  Review all
                </Link>
              </div>
              <div className="mt-4 space-y-3">
                {data.askDse.topUnresolved.length === 0 ? (
                  <p className="text-sm text-slate-500">No unresolved Ask DSE information gaps in this period.</p>
                ) : data.askDse.topUnresolved.map((item) => (
                  <div key={item.normalizedQuestion} className="flex items-start justify-between gap-3 border-b pb-3 last:border-0">
                    <p className="text-sm text-slate-700">{item.sampleQuestion}</p>
                    <span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{item.count}×</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <p className="text-xs text-slate-500">Analytics retention: {data.retentionDays} days.</p>
        </>
      ) : null}
    </div>
  );
}
