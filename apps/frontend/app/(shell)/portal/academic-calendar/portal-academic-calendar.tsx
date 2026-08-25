"use client";

import { useCallback } from "react";
import {
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import type { StudentAcademicCalendarView } from "@dse-pms/shared-types";
import { formatAcademicDate, academicSemesterLabel } from "@/lib/academic-calendar";
import { studentPortalApi } from "@/lib/student-portal";
import { PortalError, PortalLoading, usePortalData } from "../portal-state";

type AvailableCalendar = Extract<StudentAcademicCalendarView, { status: "available" }>;
type Period = AvailableCalendar["periods"][number];
type CalendarEvent = AvailableCalendar["events"][number];
type DateState = "current" | "upcoming" | "completed";

function todayDateOnly(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function periodState(period: Period, today = todayDateOnly()): DateState {
  if (today < period.teachingStart) return "upcoming";
  if (today > period.teachingEnd) return "completed";
  return "current";
}

function eventState(event: CalendarEvent, today = todayDateOnly()): DateState {
  if (today < event.startDate) return "upcoming";
  if (today > (event.endDate ?? event.startDate)) return "completed";
  return "current";
}

function periodProgress(period: Period, today = todayDateOnly()): number {
  if (today <= period.teachingStart) return 0;
  if (today >= period.teachingEnd) return 100;
  const start = Date.parse(`${period.teachingStart}T00:00:00.000Z`);
  const end = Date.parse(`${period.teachingEnd}T00:00:00.000Z`);
  const current = Date.parse(`${today}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.min(100, Math.round(((current - start) / (end - start)) * 100)));
}

function StateBadge({ state }: { state: DateState }) {
  const classes = state === "current"
    ? "border-primary/30 bg-primary/10 text-primary"
    : state === "upcoming"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-border bg-muted text-muted-foreground";
  const label = state === "current" ? "In progress" : state === "upcoming" ? "Upcoming" : "Completed";
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>{label}</span>;
}

function PeriodCard({ period }: { period: Period }) {
  const state = periodState(period);
  const progress = periodProgress(period);
  return (
    <section className={`rounded-2xl border bg-card p-5 transition ${state === "current" ? "border-primary/40 shadow-sm" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Semester period</p>
          <h3 className="mt-1 text-lg font-semibold">{academicSemesterLabel(period.semester)}</h3>
        </div>
        <StateBadge state={state} />
      </div>

      <div className="mt-5 rounded-xl bg-muted/35 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4 text-primary" />
          {formatAcademicDate(period.teachingStart)} – {formatAcademicDate(period.teachingEnd)}
        </div>
        {state === "current" ? (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Teaching period progress</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-3 text-sm">
        <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-3">
          <dt className="text-muted-foreground">Examinations</dt>
          <dd className="text-right font-medium">
            {period.examStart && period.examEnd
              ? `${formatAcademicDate(period.examStart)} – ${formatAcademicDate(period.examEnd)}`
              : "To be announced"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="text-muted-foreground">Semester break</dt>
          <dd className="text-right font-medium">
            {period.breakStart && period.breakEnd
              ? `${formatAcademicDate(period.breakStart)} – ${formatAcademicDate(period.breakEnd)}`
              : "To be announced"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function EventTimeline({ events, nextEventKey }: { events: CalendarEvent[]; nextEventKey: string | null }) {
  if (!events.length) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
        <CalendarDays className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No additional events published</p>
        <p className="mt-1 text-xs text-muted-foreground">Semester teaching dates above remain your official calendar reference.</p>
      </div>
    );
  }

  return (
    <div className="relative ml-2 space-y-1 before:absolute before:bottom-4 before:left-[4.5rem] before:top-4 before:w-px before:bg-border sm:before:left-[7.5rem]">
      {events.map((event) => {
        const state = eventState(event);
        const isNext = event.id === nextEventKey;
        return (
          <div key={event.id} className="relative grid grid-cols-[4rem_1fr] gap-4 py-3 sm:grid-cols-[7rem_1fr]">
            <div className="text-right">
              <p className="text-xs font-semibold tabular-nums text-foreground">{formatAcademicDate(event.startDate)}</p>
              {event.endDate ? <p className="mt-0.5 text-[11px] text-muted-foreground">to {formatAcademicDate(event.endDate)}</p> : null}
            </div>
            <div className={`relative rounded-xl border p-3.5 ${isNext ? "border-primary/35 bg-primary/5" : "border-border bg-card"}`}>
              <span className={`absolute -left-[1.3rem] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-background ${state === "completed" ? "bg-muted-foreground/50" : "bg-primary"}`} />
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{event.title}</p>
                    {isNext ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">NEXT</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.type}{event.semester ? ` · ${academicSemesterLabel(event.semester)}` : ""}
                  </p>
                  {event.note ? <p className="mt-2 text-sm text-muted-foreground">{event.note}</p> : null}
                </div>
                <StateBadge state={state} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PortalAcademicCalendar() {
  const load = useCallback(() => studentPortalApi.academicCalendar(), []);
  const { data, loading, error } = usePortalData(load);
  if (loading) return <PortalLoading />;
  if (error || !data) return <PortalError message={error ?? "Could not load your Academic Calendar"} />;

  if (data.status === "unavailable") {
    return (
      <div className="mx-auto max-w-4xl">
        <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center md:p-12">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <CalendarDays className="h-7 w-7 text-muted-foreground" />
          </span>
          <h2 className="mt-4 text-xl font-semibold">Calendar not available yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{data.message}</p>
          <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            We never substitute another study year&apos;s dates.
          </div>
        </section>
      </div>
    );
  }

  const nextEventKey = data.nextEvent?.key ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Published official calendar
                </span>
                <span className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">Study Year {data.studyYear}</span>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">Academic year</p>
              <h2 className="mt-0.5 text-3xl font-bold tracking-tight">{data.academicYear.label}</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                These dates are matched automatically to your programme progression. You do not need to choose a year manually.
              </p>
            </div>

            <div className="min-w-0 rounded-2xl border border-border bg-background/80 p-4 lg:w-[22rem]">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <Clock3 className="h-4 w-4" /> What&apos;s next
              </p>
              {data.nextEvent ? (
                <>
                  <p className="mt-2 text-base font-semibold">{data.nextEvent.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatAcademicDate(data.nextEvent.startDate)}
                    {data.nextEvent.endDate ? ` – ${formatAcademicDate(data.nextEvent.endDate)}` : ""}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No upcoming academic event is currently published.</p>
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-4 text-xs text-muted-foreground sm:grid-cols-3 md:px-7">
          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Published dates only</span>
          <span className="flex items-center gap-2"><CalendarCheck2 className="h-4 w-4 text-primary" /> Auto-matched to your study year</span>
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> No cross-year fallback</span>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h3 className="text-lg font-semibold">Semester overview</h3>
          <p className="mt-1 text-sm text-muted-foreground">Teaching, examination, and break periods at a glance.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {data.periods.map((period) => <PeriodCard key={period.id} period={period} />)}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Academic timeline</h3>
            <p className="mt-1 text-sm text-muted-foreground">Registration, holidays, exams, and other published programme events.</p>
          </div>
          <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        </div>
        <div className="mt-4">
          <EventTimeline events={data.events} nextEventKey={nextEventKey} />
        </div>
      </section>
    </div>
  );
}
