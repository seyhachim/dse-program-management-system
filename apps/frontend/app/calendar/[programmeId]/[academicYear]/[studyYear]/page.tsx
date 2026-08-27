"use client";

import { use, useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, ShieldCheck } from "lucide-react";
import type { AcademicCalendarEventView, PublishedAcademicCalendarProjection } from "@dse-pms/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type PublicAcademicCalendarPageProps = {
  params: Promise<{
    programmeId: string;
    academicYear: string;
    studyYear: string;
  }>;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function semesterLabel(value: "First" | "Second"): string {
  return value === "First" ? "Semester 1" : "Semester 2";
}

function studyYearFromSegment(value: string): number | null {
  const match = /^year-([1-4])$/i.exec(value) ?? /^([1-4])$/.exec(value);
  return match ? Number(match[1]) : null;
}

function EventList({ events, title = "Academic events" }: { events: AcademicCalendarEventView[]; title?: string }) {
  if (!events.length) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 divide-y divide-border">
        {events.map((event) => (
          <div key={event.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{event.title}</p>
                  {event.type === "Holiday" ? (
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      Official holiday · All study years
                    </span>
                  ) : null}
                </div>
                {event.note ? <p className="mt-1 text-sm text-muted-foreground">{event.note}</p> : null}
              </div>
              <p className="shrink-0 text-sm text-muted-foreground">{formatDate(event.startDate)}{event.endDate ? ` – ${formatDate(event.endDate)}` : ""}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PublicAcademicCalendarPage({ params }: PublicAcademicCalendarPageProps) {
  const resolvedParams = use(params);
  const programmeId = decodeURIComponent(resolvedParams.programmeId);
  const academicYearRoute = decodeURIComponent(resolvedParams.academicYear);
  // Keep the route/API identifier canonical (2026-2027); use an en dash only for presentation.
  const academicYearDisplay = academicYearRoute.replace(/-/g, "–");
  const studyYear = studyYearFromSegment(resolvedParams.studyYear);
  const [data, setData] = useState<PublishedAcademicCalendarProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const endpoint = useMemo(() => {
    if (!studyYear) return null;
    const query = new URLSearchParams({ studyYear: String(studyYear), academicYear: academicYearRoute });
    return `${API_URL}/api/programme/public/programmes/${encodeURIComponent(programmeId)}/academic-calendar?${query.toString()}`;
  }, [programmeId, academicYearRoute, studyYear]);

  useEffect(() => {
    if (!endpoint) {
      setError("Invalid study year. Use year-1, year-2, year-3, or year-4.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the published academic calendar.");
        return response.json() as Promise<PublishedAcademicCalendarProjection>;
      })
      .then((value) => { if (!cancelled) setData(value); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the published academic calendar."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [endpoint]);

  const events = data?.status === "available" ? data.events : data?.events ?? [];
  const sources = data?.status === "available" ? data.sources : data?.sources ?? [];

  return (
    <main className="min-h-screen bg-muted/20 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary"><CalendarDays className="h-7 w-7" /></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">DSE Programme</p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Academic Calendar</h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">{academicYearDisplay} · {studyYear ? `Year ${studyYear}` : "Study year"}</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Official published calendar only
              </div>
            </div>
          </div>
        </header>

        {loading ? <section className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading official calendar…</section> : null}
        {error ? <section role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">{error}</section> : null}

        {!loading && !error && data?.status === "unavailable" ? (
          <section className="rounded-3xl border border-dashed border-border bg-card p-8 text-center sm:p-12">
            <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Calendar not issued yet</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              The official semester calendar for Year {studyYear} in {data.academicYear?.label ?? academicYearDisplay} has not yet been published.
              Please check this same link again later or follow DSE announcements.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">No other study year is substituted, and draft dates are never shown here. Published programme-wide holidays may still appear below.</p>
          </section>
        ) : null}

        {!loading && !error && data?.status === "available" ? (
          <section className="grid gap-4 md:grid-cols-2">
            {data.periods.map((period) => (
              <article key={period.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-lg font-semibold">{semesterLabel(period.semester)}</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4"><dt className="text-muted-foreground">Teaching</dt><dd className="text-right font-medium">{formatDate(period.teachingStart)} – {formatDate(period.teachingEnd)}</dd></div>
                  <div className="flex items-start justify-between gap-4"><dt className="text-muted-foreground">Final Exam week</dt><dd className="text-right">{period.examStart ? `${formatDate(period.examStart)} – ${formatDate(period.examEnd)}` : "Not issued"}</dd></div>
                  {period.breakStart ? (
                    <div className="flex items-start justify-between gap-4"><dt className="text-muted-foreground">Break</dt><dd className="text-right">{formatDate(period.breakStart)} – {formatDate(period.breakEnd)}</dd></div>
                  ) : null}
                </dl>
              </article>
            ))}
          </section>
        ) : null}

        {!loading && !error ? <EventList events={events} title={data?.status === "unavailable" ? "Published official holidays" : "Academic events"} /> : null}

        {!loading && !error && sources.length ? (
          <section className="rounded-2xl border border-border bg-card p-5 text-sm shadow-sm">
            <h2 className="font-semibold">Official source</h2>
            <div className="mt-3 space-y-2">
              {sources.map((source, index) => (
                <div key={`${source.title}-${index}`}>
                  <p className="font-medium">{source.title}</p>
                  {source.publishedAt ? <p className="text-muted-foreground">Published {formatDate(source.publishedAt)}</p> : null}
                  {source.url ? <a className="mt-1 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={source.url} target="_blank" rel="noreferrer">View source <ExternalLink className="h-3.5 w-3.5" /></a> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
