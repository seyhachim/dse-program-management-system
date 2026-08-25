"use client";

import { useCallback } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import type { StudentAcademicCalendarView } from "@dse-pms/shared-types";
import { formatAcademicDate, academicSemesterLabel } from "@/lib/academic-calendar";
import { studentPortalApi } from "@/lib/student-portal";
import { PortalError, PortalLoading, usePortalData } from "../portal-state";

function PeriodCard({ period }: { period: Extract<StudentAcademicCalendarView, { status: "available" }>["periods"][number] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{academicSemesterLabel(period.semester)}</h3>
        <CalendarDays className="h-5 w-5 text-primary" />
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <div className="grid gap-1 sm:grid-cols-[8rem_1fr]"><dt className="text-muted-foreground">Teaching period</dt><dd className="font-medium">{formatAcademicDate(period.teachingStart)} – {formatAcademicDate(period.teachingEnd)}</dd></div>
        <div className="grid gap-1 sm:grid-cols-[8rem_1fr]"><dt className="text-muted-foreground">Examinations</dt><dd>{period.examStart && period.examEnd ? `${formatAcademicDate(period.examStart)} – ${formatAcademicDate(period.examEnd)}` : "To be announced"}</dd></div>
        <div className="grid gap-1 sm:grid-cols-[8rem_1fr]"><dt className="text-muted-foreground">Semester break</dt><dd>{period.breakStart && period.breakEnd ? `${formatAcademicDate(period.breakStart)} – ${formatAcademicDate(period.breakEnd)}` : "To be announced"}</dd></div>
      </dl>
    </section>
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
        <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <CalendarDays className="mx-auto h-9 w-9 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">Calendar not available yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{data.message}</p>
          <p className="mt-3 text-xs text-muted-foreground">PMS never substitutes another study year&apos;s dates.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Your official calendar</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-2xl font-bold">{data.academicYear.label}</h2><p className="mt-1 text-sm text-muted-foreground">Study Year {data.studyYear}</p></div>
          {data.nextEvent ? <div className="rounded-xl bg-primary/5 px-4 py-3 sm:max-w-sm"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><Clock3 className="h-4 w-4" />Next academic event</p><p className="mt-1 text-sm font-medium">{data.nextEvent.title}</p><p className="text-xs text-muted-foreground">{formatAcademicDate(data.nextEvent.startDate)}{data.nextEvent.endDate ? ` – ${formatAcademicDate(data.nextEvent.endDate)}` : ""}</p></div> : <p className="text-sm text-muted-foreground">No upcoming calendar event is currently published.</p>}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.periods.map((period) => <PeriodCard key={period.id} period={period} />)}
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
        <h3 className="text-lg font-semibold">Academic events</h3>
        <p className="mt-1 text-sm text-muted-foreground">Additional official dates relevant to your published calendar.</p>
        <div className="mt-4 divide-y divide-border rounded-xl border border-border">
          {data.events.length ? data.events.map((event) => (
            <div key={event.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-medium">{event.title}</p><p className="text-xs text-muted-foreground">{event.type}{event.semester ? ` · ${academicSemesterLabel(event.semester)}` : ""}</p></div>
              <p className="text-sm tabular-nums">{formatAcademicDate(event.startDate)}{event.endDate ? ` – ${formatAcademicDate(event.endDate)}` : ""}</p>
            </div>
          )) : <p className="p-4 text-sm text-muted-foreground">No additional events have been published.</p>}
        </div>
      </section>
    </div>
  );
}
