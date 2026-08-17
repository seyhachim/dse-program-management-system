"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TelegramScheduleResponse, TelegramStudentAttendanceHistory } from "@dse-pms/shared-types";
import { telegramApi } from "../telegram-client";

type CourseHistory = TelegramStudentAttendanceHistory & { courseCode: string; courseTitle: string; sectionCode: string };

function statusLabel(status: TelegramStudentAttendanceHistory["history"][number]["status"]) {
  if (status === "Excused") return "Excused Absence";
  return status ?? "Unmarked";
}

export default function TelegramAttendanceHistoryPage() {
  const [items, setItems] = useState<CourseHistory[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const schedule = await telegramApi<TelegramScheduleResponse>("/api/telegram/mini/schedule");
        const studentCourses = schedule.courses.filter((course) => course.role === "student");
        const histories = await Promise.all(studentCourses.map(async (course) => ({
          ...(await telegramApi<TelegramStudentAttendanceHistory>(`/api/telegram/mini/student-attendance/${encodeURIComponent(course.offeringId)}`)),
          courseCode: course.courseCode,
          courseTitle: course.courseTitle,
          sectionCode: course.sectionCode,
        })));
        if (!cancelled) setItems(histories);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load attendance history");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  return <section className="space-y-4 pb-6">
    <Link href="/telegram" className="text-sm text-slate-500">← Home</Link>
    <header><h1 className="text-2xl font-semibold">My attendance</h1><p className="text-sm text-slate-500">Read-only attendance history from the PMS attendance register.</p></header>
    {error ? <p className="text-sm text-red-700">{error}</p> : null}
    {!items && !error ? <p className="text-sm text-slate-500">Loading attendance…</p> : null}
    {items?.length === 0 ? <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">No enrolled classes are available.</div> : null}
    {items?.map((item) => <article key={item.offeringId} className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-slate-500">{item.courseCode} · {item.sectionCode}</p><h2 className="font-semibold">{item.courseTitle}</h2></div><div className="text-right"><p className="text-xl font-semibold">{item.attendanceRate === null ? "—" : `${item.attendanceRate}%`}</p><p className="text-xs text-slate-500">attendance</p></div></div>
      <div className="mt-3 grid grid-cols-4 gap-1 text-center text-xs"><div className="rounded-lg bg-slate-100 p-2"><b className="block text-sm">{item.counts.Present}</b>Present</div><div className="rounded-lg bg-slate-100 p-2"><b className="block text-sm">{item.counts.Late}</b>Late</div><div className="rounded-lg bg-slate-100 p-2"><b className="block text-sm">{item.counts.Absent}</b>Absent</div><div className="rounded-lg bg-slate-100 p-2"><b className="block text-sm">{item.counts.Excused}</b>Excused</div></div>
      <div className="mt-4 space-y-2">{item.history.length === 0 ? <p className="text-sm text-slate-500">No attendance sessions recorded yet.</p> : item.history.map((session) => <div key={session.sessionId} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-sm"><div><p>{new Date(`${session.date}T00:00:00`).toLocaleDateString()}</p>{session.note ? <p className="text-xs text-slate-500">{session.note}</p> : null}</div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium">{statusLabel(session.status)}</span></div>)}</div>
    </article>)}
  </section>;
}
