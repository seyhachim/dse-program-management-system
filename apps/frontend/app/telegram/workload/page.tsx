"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TelegramLecturerWorkload } from "@dse-pms/shared-types";
import { telegramApi } from "../telegram-client";

export default function TelegramLecturerWorkloadPage() {
  const [data, setData] = useState<TelegramLecturerWorkload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void telegramApi<TelegramLecturerWorkload>("/api/telegram/mini/lecturer-workload")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load workload"));
  }, []);

  return <section className="space-y-4 pb-6">
    <Link href="/telegram" className="text-sm text-slate-500">← Home</Link>
    <header><h1 className="text-2xl font-semibold">Teaching workload</h1><p className="text-sm text-slate-500">Your current PMS teaching assignments and contact-hour summary.</p></header>
    {error ? <p className="text-sm text-red-700">{error}</p> : null}
    {!data && !error ? <p className="text-sm text-slate-500">Loading workload…</p> : null}
    {data ? <>
      <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-100 p-3"><p className="text-lg font-semibold">{data.scheduledWeeklyHours}</p><p className="text-xs text-slate-500">Scheduled hrs/wk</p></div><div className="rounded-xl bg-slate-100 p-3"><p className="text-lg font-semibold">{data.peakWeeklyHours}</p><p className="text-xs text-slate-500">Peak week</p></div><div className="rounded-xl bg-slate-100 p-3"><p className="text-lg font-semibold">{data.totalHours}</p><p className="text-xs text-slate-500">Planned hours</p></div></div>
      {data.scheduleRows.length === 0 ? <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">No teaching assignments are currently available.</div> : <div className="space-y-2">{data.scheduleRows.map((row) => <Link key={row.meetingId} href={`/telegram/classes/${encodeURIComponent(row.offeringId)}`} className="block rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-slate-500">{row.course.code} · {row.sectionCode}</p><p className="font-semibold">{row.course.title}</p><p className="mt-1 text-sm text-slate-600">{row.dayOfWeek} · {row.startTime}–{row.endTime}{row.room ? ` · ${row.room}` : ""}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{row.role}</span></div><p className="mt-2 text-xs text-slate-500">{row.durationHours} contact hour{row.durationHours === 1 ? "" : "s"}</p></Link>)}</div>}
      <p className="text-xs text-slate-500">Co-lecturer workload uses the PMS “{data.coLecturerAssumption}” assumption.</p>
    </> : null}
  </section>;
}
