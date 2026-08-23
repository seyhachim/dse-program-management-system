"use client";

import type { TelegramCourseCard, TelegramScheduleResponse } from "@dse-pms/shared-types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { telegramApi } from "../telegram-client";

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function meetingLabel(course: TelegramCourseCard) {
  const meeting = course.nextMeeting;
  if (!meeting) return "Schedule to be announced";
  return `${meeting.startTime}–${meeting.endTime}${meeting.room ? ` · ${meeting.room}` : ""}`;
}

export default function TelegramSchedulePage() {
  const [data, setData] = useState<TelegramScheduleResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void telegramApi<TelegramScheduleResponse>("/api/telegram/mini/schedule")
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load schedule"));
  }, []);

  const groups = useMemo(() => {
    if (!data) return [];
    const byDay = new Map<string, TelegramCourseCard[]>();
    for (const course of data.courses) {
      const day = course.nextMeeting?.dayOfWeek ?? "Unscheduled";
      byDay.set(day, [...(byDay.get(day) ?? []), course]);
    }
    return Array.from(byDay.entries()).sort(([left], [right]) => {
      if (left === "Unscheduled") return 1;
      if (right === "Unscheduled") return -1;
      return DAY_ORDER.indexOf(left) - DAY_ORDER.indexOf(right);
    });
  }, [data]);

  return (
    <section className="space-y-5 pb-6">
      <Link href="/telegram" className="text-sm font-medium text-slate-500">← Home</Link>
      <header>
        <p className="text-sm font-medium text-blue-600">DSE PMS</p>
        <h1 className="text-2xl font-semibold tracking-tight">Weekly schedule</h1>
        <p className="mt-1 text-sm text-slate-500">Your current PMS class timetable.</p>
      </header>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {!data && !error ? <p className="text-sm text-slate-500">Loading schedule…</p> : null}

      {data && data.courses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
          <p className="font-semibold">No classes available</p>
          <p className="mt-1 text-sm text-slate-500">No class timetable is currently assigned to this account.</p>
        </div>
      ) : null}

      <div className="space-y-5">
        {groups.map(([day, courses]) => (
          <section key={day} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{day}</h2>
            {courses
              .slice()
              .sort((a, b) => (a.nextMeeting?.startTime ?? "99:99").localeCompare(b.nextMeeting?.startTime ?? "99:99"))
              .map((course) => (
                <Link key={course.offeringId} href={`/telegram/classes/${encodeURIComponent(course.offeringId)}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{course.courseCode} · {course.sectionCode}</p>
                      <p className="mt-1 font-semibold text-slate-950">{course.courseTitle}</p>
                      <p className="mt-2 text-sm text-slate-500">{meetingLabel(course)}</p>
                    </div>
                    <span aria-hidden="true" className="text-slate-400">›</span>
                  </div>
                </Link>
              ))}
          </section>
        ))}
      </div>
    </section>
  );
}
