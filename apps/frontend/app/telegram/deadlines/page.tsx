"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TelegramAssessmentDeadlineDashboard } from "@dse-pms/shared-types";
import { telegramApi } from "../telegram-client";

function dueLabel(dueAt: string | null, dueWeek: number | null) {
  if (dueAt) {
    const due = new Date(dueAt);
    const diffDays = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
    if (diffDays < 0) return `Overdue · ${due.toLocaleDateString()}`;
    if (diffDays === 0) return "Due today";
    if (diffDays <= 7) return `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
    return due.toLocaleDateString();
  }
  return dueWeek ? `Due week ${dueWeek}` : "Deadline not set";
}

export default function TelegramDeadlinesPage() {
  const [data, setData] = useState<TelegramAssessmentDeadlineDashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void telegramApi<TelegramAssessmentDeadlineDashboard>("/api/telegram/mini/assessment-deadlines")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load assessment deadlines"));
  }, []);

  return <section className="space-y-4 pb-6">
    <Link href="/telegram" className="text-sm text-slate-500">← Home</Link>
    <header><h1 className="text-2xl font-semibold">Assessment deadlines</h1><p className="text-sm text-slate-500">Upcoming and outstanding assessment work from your PMS courses.</p></header>
    {error ? <p className="text-sm text-red-700">{error}</p> : null}
    {!data && !error ? <p className="text-sm text-slate-500">Loading deadlines…</p> : null}
    {data?.assessments.length === 0 ? <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">No pending assessments are currently available.</div> : null}
    <div className="space-y-2">{data?.assessments.map((item) => <Link key={`${item.offeringId}:${item.assessmentId}`} href={`/telegram/classes/${encodeURIComponent(item.offeringId)}`} className="block rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-slate-500">{item.courseCode} · {item.sectionCode}</p><p className="font-semibold">{item.name}</p><p className="text-sm text-slate-600">{item.courseTitle}</p></div>{item.weight != null ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{item.weight}%</span> : null}</div>
      <p className="mt-3 text-sm font-medium">{dueLabel(item.dueAt, item.dueWeek)}</p>
    </Link>)}</div>
  </section>;
}
