"use client";

import type { TelegramCourseCard, TelegramStudentAttendanceHistory } from "@dse-pms/shared-types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { telegramApi } from "./telegram-client";

type HealthItem = { course: TelegramCourseCard; history: TelegramStudentAttendanceHistory };

const stateRank: Record<TelegramStudentAttendanceHistory["health"]["state"], number> = {
  warning: 4,
  watch: 3,
  recovery: 2,
  healthy: 1,
};

function appearance(state: TelegramStudentAttendanceHistory["health"]["state"]) {
  if (state === "warning") return { icon: "⚠", label: "Needs attention", className: "border-amber-300 bg-amber-50 text-amber-950" };
  if (state === "watch") return { icon: "⏰", label: "Keep an eye on this", className: "border-orange-200 bg-orange-50 text-orange-950" };
  if (state === "recovery") return { icon: "🌱", label: "Nice improvement", className: "border-emerald-200 bg-emerald-50 text-emerald-950" };
  return { icon: "🔥", label: "Your progress", className: "border-blue-100 bg-blue-50 text-blue-950" };
}

export function StudentAttendanceHealthHome({ courses }: { courses: TelegramCourseCard[] }) {
  const [items, setItems] = useState<HealthItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const studentCourses = courses.filter((course) => course.role === "student");
    async function load() {
      const loaded = await Promise.allSettled(studentCourses.map(async (course) => ({
        course,
        history: await telegramApi<TelegramStudentAttendanceHistory>(
          `/api/telegram/mini/student-attendance/${encodeURIComponent(course.offeringId)}`,
        ),
      })));
      if (!cancelled) setItems(loaded.flatMap((result) => result.status === "fulfilled" ? [result.value] : []));
    }
    void load();
    return () => { cancelled = true; };
  }, [courses]);

  const selected = useMemo(() => [...items].sort((a, b) => {
    const rank = stateRank[b.history.health.state] - stateRank[a.history.health.state];
    if (rank !== 0) return rank;
    return (a.history.attendanceRate ?? 101) - (b.history.attendanceRate ?? 101);
  })[0] ?? null, [items]);

  if (!selected) return null;
  const { course, history } = selected;
  const style = appearance(history.health.state);
  const leadSignal = [...history.health.signals]
    .sort((a, b) => (b.level === "warning" ? 1 : 0) - (a.level === "warning" ? 1 : 0))[0] ?? null;
  const visibleAchievements = leadSignal ? [] : (history.health.achievements ?? []).slice(0, 2);

  return (
    <section className="space-y-3" aria-labelledby="attendance-health-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="attendance-health-heading" className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Attendance health</h2>
        <Link href="/telegram/attendance" className="text-xs font-semibold text-blue-600">View all</Link>
      </div>
      <Link href={`/telegram/attendance?offeringId=${encodeURIComponent(course.offeringId)}`} className={`block rounded-2xl border p-4 shadow-sm ${style.className}`}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="font-semibold">{style.icon} {style.label}</p><p className="mt-1 text-xs font-medium opacity-75">{course.courseCode} · {course.sectionCode}</p></div>
          <div className="text-right"><p className="text-xl font-semibold">{history.attendanceRate === null ? "—" : `${history.attendanceRate}%`}</p><p className="text-[11px] opacity-70">finalized attendance</p></div>
        </div>
        <p className="mt-3 text-sm leading-5">{history.health.message}</p>
        {leadSignal ? <div className="mt-3 rounded-xl bg-white/55 p-3 text-sm"><p className="font-semibold">{leadSignal.title}</p><p className="mt-1 leading-5">{leadSignal.message}</p>{leadSignal.advice[0] ? <p className="mt-2 text-xs leading-5">Tip: {leadSignal.advice[0]}</p> : null}</div> : null}
        {!leadSignal && history.health.attendanceStreak > 0 ? <p className="mt-3 text-xs font-semibold">🔥 {history.health.attendanceStreak} finalized classes attended in a row</p> : null}
        {visibleAchievements.length > 0 ? <div className="mt-3 flex flex-wrap gap-2" aria-label="Private attendance achievements">{visibleAchievements.map((achievement) => <span key={achievement.kind} className="rounded-full bg-white/65 px-2.5 py-1 text-xs font-semibold" title={achievement.description}>{achievement.icon} {achievement.title}</span>)}</div> : null}
        <p className="mt-3 text-xs font-semibold">View attendance & progress →</p>
      </Link>
    </section>
  );
}
