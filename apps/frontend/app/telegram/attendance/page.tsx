"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TelegramScheduleResponse, TelegramStudentAttendanceHistory } from "@dse-pms/shared-types";
import { telegramApi } from "../telegram-client";

type CourseHistory = TelegramStudentAttendanceHistory & { courseCode: string; courseTitle: string; sectionCode: string };

function statusLabel(session: TelegramStudentAttendanceHistory["history"][number]) {
  if (session.permissionPending) return "Permission Pending";
  if (session.status === "Excused") return "Permission / Excused";
  return session.status ?? "Unmarked";
}

function healthClass(state: TelegramStudentAttendanceHistory["health"]["state"]) {
  if (state === "warning") return "border-amber-300 bg-amber-50 text-amber-950";
  if (state === "watch") return "border-orange-200 bg-orange-50 text-orange-950";
  if (state === "recovery") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  return "border-blue-100 bg-blue-50 text-blue-950";
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
    <header><h1 className="text-2xl font-semibold">My attendance</h1><p className="text-sm text-slate-500">Read-only attendance history and supportive progress guidance from DSE PMS.</p></header>
    {error ? <p className="text-sm text-red-700">{error}</p> : null}
    {!items && !error ? <p className="text-sm text-slate-500">Loading attendance…</p> : null}
    {items?.length === 0 ? <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">No enrolled classes are available.</div> : null}
    {items?.map((item) => {
      const achievements = item.health.state === "healthy" || item.health.state === "recovery"
        ? item.health.achievements ?? []
        : [];
      return <article key={item.offeringId} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-slate-500">{item.courseCode} · {item.sectionCode}</p><h2 className="font-semibold">{item.courseTitle}</h2></div><div className="text-right"><p className="text-xl font-semibold">{item.attendanceRate === null ? "—" : `${item.attendanceRate}%`}</p><p className="text-xs text-slate-500">finalized attendance</p></div></div>
        <div className={`mt-3 rounded-xl border p-3 text-sm ${healthClass(item.health.state)}`}>
          <div className="flex items-center justify-between gap-3"><p className="font-semibold">{item.health.state === "warning" ? "⚠ Attendance health" : item.health.state === "watch" ? "⏰ Attendance reminder" : item.health.state === "recovery" ? "🌱 Nice improvement" : "🔥 Your progress"}</p><span className="text-xs font-semibold">{item.health.attendanceStreak} class streak</span></div>
          <p className="mt-1 leading-5">{item.health.message}</p>
          {item.health.signals.map((signal) => <div key={signal.kind} className="mt-3 border-t border-current/10 pt-3"><p className="font-semibold">{signal.title}</p><p className="mt-1">{signal.message}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{signal.advice.map((advice) => <li key={advice}>{advice}</li>)}</ul></div>)}
        </div>
        {achievements.length > 0 ? <section className="mt-3" aria-label="Your private attendance achievements"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Your achievements</h3><span className="text-[11px] text-slate-400">Private to you</span></div><div className="mt-2 grid gap-2 sm:grid-cols-2">{achievements.map((achievement) => <div key={achievement.kind} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-start gap-2"><span className="text-xl" aria-hidden="true">{achievement.icon}</span><div><p className="text-sm font-semibold text-slate-900">{achievement.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{achievement.description}</p></div></div></div>)}</div></section> : null}
        {item.counts.PermissionPending > 0 ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">🟠 Permission letter pending</p><p className="mt-1 leading-5">Please give your paper permission letter to your lecturer. Pending records are not counted as finalized P or A.</p></div> : null}
        <div className="mt-3 grid grid-cols-5 gap-1 text-center text-xs"><div className="rounded-lg bg-slate-100 p-2"><b className="block text-sm">{item.counts.Present}</b>Present</div><div className="rounded-lg bg-slate-100 p-2"><b className="block text-sm">{item.counts.Late}</b>Late</div><div className="rounded-lg bg-slate-100 p-2"><b className="block text-sm">{item.counts.Absent}</b>Absent</div><div className="rounded-lg bg-slate-100 p-2"><b className="block text-sm">{item.counts.Excused}</b>Permission</div><div className="rounded-lg bg-amber-50 p-2 text-amber-900"><b className="block text-sm">{item.counts.PermissionPending}</b>Pending</div></div>
        <div className="mt-4 space-y-2">{item.history.length === 0 ? <p className="text-sm text-slate-500">No attendance sessions recorded yet.</p> : item.history.map((session) => <div key={session.sessionId} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-sm"><div><p>{new Date(`${session.date}T00:00:00`).toLocaleDateString()}</p>{session.note ? <p className="text-xs text-slate-500">{session.note}</p> : null}</div><span className={`rounded-full px-2 py-1 text-xs font-medium ${session.permissionPending ? "bg-amber-50 text-amber-800" : "bg-slate-100"}`}>{statusLabel(session)}</span></div>)}</div>
      </article>;
    })}
  </section>;
}
