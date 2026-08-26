"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Clock3, Copy, FilePenLine, Link2 } from "lucide-react";
import type { AcademicCalendarView, AcademicYearView } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { academicCalendarApi, formatAcademicDate } from "@/lib/academic-calendar";

const STUDY_YEARS = [1, 2, 3, 4] as const;

type YearState = {
  calendar: AcademicCalendarView | null;
  status: "Published" | "Draft" | "NotIssued";
};

function publicYearSlug(label: string): string {
  return label.replace(/–/g, "-").replace(/\s+/g, "");
}

function publicPath(programmeId: string, academicYear: string, studyYear: number): string {
  return `/calendar/${encodeURIComponent(programmeId)}/${encodeURIComponent(publicYearSlug(academicYear))}/year-${studyYear}`;
}

function resolveYearState(calendars: AcademicCalendarView[], studyYear: number): YearState {
  const matches = calendars.filter((calendar) => calendar.studyYears.includes(studyYear));
  const published = matches.find((calendar) => calendar.status === "Published");
  if (published) return { calendar: published, status: "Published" };
  const draft = matches.find((calendar) => calendar.status === "Draft");
  if (draft) return { calendar: draft, status: "Draft" };
  return { calendar: null, status: "NotIssued" };
}

export function AcademicCalendarSharePanel() {
  const [programmeId, setProgrammeId] = useState("");
  const [years, setYears] = useState<AcademicYearView[]>([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [calendars, setCalendars] = useState<AcademicCalendarView[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedYear, setCopiedYear] = useState<number | null>(null);

  const selectedYear = useMemo(
    () => years.find((year) => year.id === selectedYearId) ?? null,
    [years, selectedYearId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const programme = await academicCalendarApi.programme();
        const academicYears = await academicCalendarApi.years(programme.id);
        const preferred = academicYears.find((year) => year.isCurrent) ?? academicYears[0] ?? null;
        const calendarRows = preferred ? await academicCalendarApi.calendars(programme.id, preferred.id) : [];
        if (cancelled) return;
        setProgrammeId(programme.id);
        setYears(academicYears);
        setSelectedYearId(preferred?.id ?? "");
        setCalendars(calendarRows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const changeYear = async (academicYearId: string) => {
    setSelectedYearId(academicYearId);
    setCopiedYear(null);
    if (!programmeId || !academicYearId) {
      setCalendars([]);
      return;
    }
    setCalendars(await academicCalendarApi.calendars(programmeId, academicYearId));
  };

  const copyLink = async (studyYear: number) => {
    if (!selectedYear || !programmeId) return;
    const path = publicPath(programmeId, selectedYear.label, studyYear);
    const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopiedYear(studyYear);
    window.setTimeout(() => setCopiedYear((current) => current === studyYear ? null : current), 1800);
  };

  if (loading || !selectedYear) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Public calendar links</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Stable read-only links for the Student Handbook, Telegram, QR codes, or the DSE website. The same link remains valid before and after a calendar is published.
          </p>
        </div>
        <div className="min-w-56">
          <label className="text-sm font-medium" htmlFor="share-academic-year">Academic Year</label>
          <select
            id="share-academic-year"
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedYearId}
            onChange={(event) => void changeYear(event.target.value)}
          >
            {years.map((year) => <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? " · Current" : ""}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STUDY_YEARS.map((year) => {
          const state = resolveYearState(calendars, year);
          const firstPeriod = state.calendar?.periods[0];
          return (
            <article key={year} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study year</p>
                  <h3 className="mt-1 text-lg font-semibold">Year {year}</h3>
                </div>
                {state.status === "Published" ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Published</span>
                ) : state.status === "Draft" ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"><FilePenLine className="h-3.5 w-3.5" /> Draft</span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Not issued yet</span>
                )}
              </div>

              <div className="mt-3 min-h-12 text-xs leading-5 text-muted-foreground">
                {state.status === "Published" && firstPeriod ? (
                  <p>Official calendar available. Teaching begins {formatAcademicDate(firstPeriod.teachingStart)}.</p>
                ) : state.status === "Draft" ? (
                  <p>A draft exists but is not visible on the public page. Students will still see “Calendar not issued yet”.</p>
                ) : (
                  <p>The official {selectedYear.label} calendar for Year {year} has not been published yet.</p>
                )}
              </div>

              <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => void copyLink(year)}>
                {copiedYear === year ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedYear === year ? "Link copied" : "Copy public link"}
              </Button>
            </article>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Public links expose only published Academic Calendar data. Missing years do not fall back to another study year, and draft dates are never exposed.
      </p>
    </section>
  );
}
