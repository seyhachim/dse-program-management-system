"use client";

import { useEffect, useMemo, useState } from "react";
import type { WeeklyTeachingReport, WeeklyTeachingSession, WeeklyTeachingStatus } from "@dse-pms/shared-types";
import { ApiError, api } from "@/lib/api";

const CAMBODIA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const PAGE_SIZE = 40;

function mondayOf(date: string): string {
  const parsed = new Date(date + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime())) return mondayOf(new Date(Date.now() + CAMBODIA_OFFSET_MS).toISOString().slice(0, 10));
  const offset = (parsed.getUTCDay() + 6) % 7;
  return new Date(parsed.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
}

function shiftWeek(weekStart: string, offset: number): string {
  const parsed = new Date(weekStart + "T00:00:00.000Z");
  return new Date(parsed.getTime() + offset * 7 * DAY_MS).toISOString().slice(0, 10);
}

const STATUS_LABELS: Record<WeeklyTeachingStatus, string> = {
  held_as_planned: "Taught as planned",
  held_with_changes: "Taught with variation",
  not_held: "Not held",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  approved_leave: "Approved leave",
  holiday: "Holiday / break",
  missing_evidence: "Missing evidence",
  upcoming: "Upcoming",
};

const STATUS_STYLES: Record<WeeklyTeachingStatus, string> = {
  held_as_planned: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  held_with_changes: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  not_held: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  cancelled: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300",
  rescheduled: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  approved_leave: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  holiday: "border-border bg-muted text-muted-foreground",
  missing_evidence: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  upcoming: "border-border bg-muted/40 text-muted-foreground",
};

function hours(minutes: number): string {
  return (minutes / 60).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " h";
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function SummaryItem({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function WeeklyTeachingMonitorClient() {
  const [weekStart, setWeekStart] = useState(() =>
    mondayOf(new Date(Date.now() + CAMBODIA_OFFSET_MS).toISOString().slice(0, 10)),
  );
  const [report, setReport] = useState<WeeklyTeachingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshId, setRefreshId] = useState(0);
  const [year, setYear] = useState("all");
  const [course, setCourse] = useState("all");
  const [section, setSection] = useState("all");
  const [lecturer, setLecturer] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void api.get<WeeklyTeachingReport>("/api/dashboard/weekly-teaching?weekStart=" + weekStart)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setReport(null);
        setError(cause instanceof ApiError && cause.status === 403
          ? "Only Admin and the currently appointed Head of Program can view this dashboard."
          : cause instanceof Error ? cause.message : "Could not load weekly teaching");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [weekStart, refreshId]);

  const all = report?.sessions ?? [];
  const years = useMemo(() => distinct(all.map((row) => row.programmeYear).filter((x): x is number => x !== null)).sort(), [all]);
  const courses = useMemo(() => distinct(all.map((row) => row.courseCode)).sort(), [all]);
  const sections = useMemo(() => distinct(all.map((row) => row.sectionCode)).sort(), [all]);
  const lecturers = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of all) row.lecturerIds.forEach((id, i) => map.set(id, row.lecturerNames[i] ?? id));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const filtered = useMemo(() => all.filter((row) =>
    (year === "all" || String(row.programmeYear) === year)
    && (course === "all" || row.courseCode === course)
    && (section === "all" || row.sectionCode === section)
    && (lecturer === "all" || row.lecturerIds.includes(lecturer))
    && (status === "all" || row.status === status),
  ), [all, year, course, section, lecturer, status]);

  useEffect(() => { setPage(0); }, [weekStart, year, course, section, lecturer, status]);

  const summary = useMemo(() => {
    const planned = filtered.filter((row) => row.status !== "holiday");
    const delivered = filtered.filter((row) => row.status === "held_as_planned" || row.status === "held_with_changes");
    const attention = filtered.filter((row) => ["not_held", "cancelled", "rescheduled", "approved_leave", "missing_evidence"].includes(row.status));
    return {
      planned: planned.length,
      delivered: delivered.length,
      hoursPlanned: planned.reduce((sum, row) => sum + row.scheduledMinutes, 0),
      hoursDelivered: delivered.reduce((sum, row) => sum + row.deliveredMinutes, 0),
      missing: filtered.filter((row) => row.status === "missing_evidence").length,
      leave: filtered.filter((row) => row.status === "approved_leave").length,
      cancelled: filtered.filter((row) => row.status === "cancelled" || row.status === "not_held").length,
      upcoming: filtered.filter((row) => row.status === "upcoming").length,
      attention: attention.length,
    };
  }, [filtered]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  function clearFilters() {
    setYear("all");
    setCourse("all");
    setSection("all");
    setLecturer("all");
    setStatus("all");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Scheduled versus delivered teaching</h2>
            <p className="text-sm text-muted-foreground">
              One Monday–Sunday week in Cambodia time. Records are read-only; missing evidence does not prove lecturer absence.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button className="h-10 rounded-md border border-input px-3 text-sm hover:bg-muted" onClick={() => setWeekStart((w) => shiftWeek(w, -1))} aria-label="Previous week">← Previous</button>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Week containing date
              <input type="date" value={weekStart} onChange={(event) => {
                if (event.target.value) setWeekStart(mondayOf(event.target.value));
              }} className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground"/>
            </label>
            <button className="h-10 rounded-md border border-input px-3 text-sm hover:bg-muted" onClick={() => setWeekStart((w) => shiftWeek(w, 1))} aria-label="Next week">Next →</button>
            <button className="h-10 rounded-md border border-input px-3 text-sm hover:bg-muted" onClick={() => setRefreshId((x) => x + 1)} disabled={loading}>Refresh</button>
          </div>
        </div>
        {report ? <p className="mt-2 text-xs text-muted-foreground">{report.weekStart} to {report.weekEnd} • Generated {new Date(report.generatedAt).toLocaleString("en-GB", { timeZone: "Asia/Phnom_Penh" })}</p> : null}
      </section>

      {error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p> : null}
      {loading ? <p role="status" className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Loading recorded and planned sessions…</p> : null}

      {!loading && report ? (
        <>
          {report.unboundedActiveOfferings > 0 ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              {report.unboundedActiveOfferings} active offering(s) lack complete teaching dates and cannot be placed accurately in the weekly report. Review their academic calendar assignment.
            </p>
          ) : null}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Filter classes</h3>
              <button className="text-sm underline underline-offset-4 hover:text-primary" onClick={clearFilters}>Reset filters</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="grid gap-1 text-xs text-muted-foreground">Year
                <select className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={year} onChange={(e) => setYear(e.target.value)}>
                  <option value="all">All years</option>
                  {years.map((value) => <option key={value} value={value}>Year {value}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Course
                <select className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={course} onChange={(e) => setCourse(e.target.value)}>
                  <option value="all">All courses</option>
                  {courses.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Class / section
                <select className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={section} onChange={(e) => setSection(e.target.value)}>
                  <option value="all">All sections</option>
                  {sections.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Lecturer
                <select className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={lecturer} onChange={(e) => setLecturer(e.target.value)}>
                  <option value="all">All lecturers</option>
                  {lecturers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Status
                <select className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">All statuses</option>
                  {(Object.keys(STATUS_LABELS) as WeeklyTeachingStatus[]).map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6" aria-label="Weekly teaching summary for selected filters">
            <SummaryItem title="Scheduled classes" value={String(summary.planned)} hint={hours(summary.hoursPlanned) + " planned"} />
            <SummaryItem title="Delivered classes" value={String(summary.delivered)} hint={hours(summary.hoursDelivered) + " delivered"} />
            <SummaryItem title="Missing evidence" value={String(summary.missing)} hint="Not an absence finding" />
            <SummaryItem title="Canceled / not held" value={String(summary.cancelled)} />
            <SummaryItem title="Approved leave" value={String(summary.leave)} hint="No private reason shown" />
            <SummaryItem title="Need review" value={String(summary.attention)} hint={summary.upcoming + " upcoming; recovery not counted"} />
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
              <div>
                <h3 className="font-semibold">Class-by-class evidence</h3>
                <p className="text-xs text-muted-foreground">{filtered.length} sessions match filters. Scheduled meetings appear even without a monitor record.</p>
              </div>
              <span className="text-xs text-muted-foreground">Page {currentPage + 1} of {pages}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-3 font-medium">Date / time</th>
                    <th scope="col" className="px-3 py-3 font-medium">Course / class</th>
                    <th scope="col" className="px-3 py-3 font-medium">Scheduled lecturer(s)</th>
                    <th scope="col" className="px-3 py-3 font-medium">Planned / actual topic</th>
                    <th scope="col" className="px-3 py-3 font-medium">Delivery</th>
                    <th scope="col" className="px-3 py-3 font-medium">Hours / arrival</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((row) => <SessionRow key={row.meetingId + ":" + row.date} row={row}/>)}
                  {visible.length === 0 ? <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No scheduled classes match these filters.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border p-3">
              <button disabled={currentPage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="h-9 rounded-md border border-input px-3 text-sm disabled:opacity-40">Previous</button>
              <button disabled={currentPage >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} className="h-9 rounded-md border border-input px-3 text-sm disabled:opacity-40">Next</button>
            </div>
          </section>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Source: official teaching dates + recurring meeting schedule, approved calendar holidays,
            exact-occurrence monitor records, and approved teaching leave. A missing arrival punch
            is not lecturer absence. Reported hours are descriptive only; make-up/recovery obligations,
            lecturer verification and dispute resolution are reserved for later phases.
          </p>
        </>
      ) : null}
    </div>
  );
}

function SessionRow({ row }: { row: WeeklyTeachingSession }) {
  return (
    <tr className="align-top hover:bg-muted/20">
      <td className="whitespace-nowrap px-3 py-3">
        <div className="font-medium">{row.date}</div>
        <div className="text-xs text-muted-foreground">{row.dayOfWeek} • {row.startTime}–{row.endTime}</div>
        {row.room ? <div className="text-xs text-muted-foreground">{row.room}</div> : null}
      </td>
      <td className="px-3 py-3">
        <div className="font-semibold">{row.courseCode}</div>
        <div className="max-w-44 text-xs text-muted-foreground">{row.courseTitle}</div>
        <div className="mt-1 text-xs">Year {row.programmeYear ?? "—"} • {row.sectionCode}</div>
      </td>
      <td className="max-w-44 px-3 py-3">
        {row.lecturerNames.length ? row.lecturerNames.join(", ") : <span className="text-muted-foreground">No assigned lecturer</span>}
      </td>
      <td className="max-w-56 px-3 py-3 text-xs">
        <div className="text-muted-foreground">Week {row.plannedWeek ?? "—"}: {row.plannedTopic || "No approved Week Plan linked"}</div>
        <div className="mt-1 font-medium">{row.actualTopic || "Actual topic not recorded"}</div>
      </td>
      <td className="px-3 py-3">
        <span className={"inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium " + STATUS_STYLES[row.status]}>
          {STATUS_LABELS[row.status]}
        </span>
        {row.holidayName ? <div className="mt-1 text-xs text-muted-foreground">{row.holidayName}</div> : null}
        {row.classSessionStatus && row.classSessionStatus !== "Scheduled" ? <div className="mt-1 text-xs text-muted-foreground">Session: {row.classSessionStatus}</div> : null}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-xs">
        <div>{hours(row.deliveredMinutes)} / {hours(row.scheduledMinutes)}</div>
        <div className="mt-1 text-muted-foreground">Arrival: {row.arrivalRecorded ? "Recorded" : "Not recorded"}</div>
        {row.approvedLeave ? <div className="mt-1">Approved leave affects this session</div> : null}
      </td>
    </tr>
  );
}
