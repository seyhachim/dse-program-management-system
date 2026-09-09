"use client";

import type { TeachingLeaveOperationalImpact } from "@dse-pms/shared-types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { telegramApi } from "../telegram-client";

function handlingLabel(value: TeachingLeaveOperationalImpact["proposedHandling"]): string {
  switch (value) {
    case "MAKE_UP": return "Make-up details will be confirmed in DSE PMS";
    case "RESCHEDULE": return "A replacement schedule will be confirmed in DSE PMS";
    case "OPEN_SLOT": return "This original class session still requires separate recovery";
    case "CANCEL": return "This session will not take place as originally scheduled";
    default: return "Check DSE PMS for the confirmed recovery arrangement";
  }
}

export default function TelegramScheduleImpactPage() {
  const searchParams = useSearchParams();
  const occurrenceId = searchParams.get("occurrenceId")?.trim() ?? "";
  const [impact, setImpact] = useState<TeachingLeaveOperationalImpact | null>(null);
  const [error, setError] = useState(occurrenceId ? "" : "This schedule update link is incomplete.");

  useEffect(() => {
    if (!occurrenceId) return;
    let cancelled = false;
    void telegramApi<TeachingLeaveOperationalImpact>(
      `/api/telegram/mini/teaching-leave-impact/${encodeURIComponent(occurrenceId)}`,
    )
      .then((value) => { if (!cancelled) setImpact(value); })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load this schedule update");
      });
    return () => { cancelled = true; };
  }, [occurrenceId]);

  return (
    <section className="space-y-5 pb-6">
      <Link href="/telegram/schedule" className="text-sm font-medium text-slate-500">← Weekly schedule</Link>
      <header>
        <p className="text-sm font-medium text-blue-600">DSE PMS</p>
        <h1 className="text-2xl font-semibold tracking-tight">Teaching schedule update</h1>
        <p className="mt-1 text-sm text-slate-500">Confirmed operational information for one class session.</p>
      </header>

      {error ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
      {!impact && !error ? <p className="text-sm text-slate-500">Loading schedule update…</p> : null}

      {impact ? (
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            {impact.courseCode} · Class {impact.sectionCode}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">{impact.courseTitle}</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div><dt className="font-medium text-slate-500">Date</dt><dd className="mt-0.5 text-slate-900">{impact.sessionDate}</dd></div>
            <div><dt className="font-medium text-slate-500">Time</dt><dd className="mt-0.5 text-slate-900">{impact.startTime}–{impact.endTime}</dd></div>
            <div><dt className="font-medium text-slate-500">Room</dt><dd className="mt-0.5 text-slate-900">{impact.room || "Not set"}</dd></div>
          </dl>
          <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <p className="font-semibold">This scheduled session is affected by an approved teaching availability change.</p>
            <p className="mt-1">{handlingLabel(impact.proposedHandling)}.</p>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            This view intentionally shows schedule-impact information only. Private leave details and internal review notes are not student-visible.
          </p>
        </article>
      ) : null}
    </section>
  );
}
