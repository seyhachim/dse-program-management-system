"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Plus, Trash2 } from "lucide-react";
import type { AcademicCalendarView, AcademicYearView, UpdateAcademicCalendarDraftInput } from "@dse-pms/shared-types";
import { Button, Input, Label } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { academicCalendarApi, formatAcademicDate } from "@/lib/academic-calendar";

type HolidayDraft = {
  title: string;
  startDate: string;
  endDate: string;
  note: string;
};

const EMPTY_HOLIDAY: HolidayDraft = { title: "", startDate: "", endDate: "", note: "" };

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}

function calendarPayload(calendar: AcademicCalendarView): UpdateAcademicCalendarDraftInput {
  return {
    studyYears: [...calendar.studyYears],
    periods: calendar.periods.map((period) => ({
      semester: period.semester,
      teachingStart: period.teachingStart,
      teachingEnd: period.teachingEnd,
      examStart: period.examStart,
      examEnd: period.examEnd,
      breakStart: period.breakStart,
      breakEnd: period.breakEnd,
    })),
    events: calendar.events.map((event, index) => ({
      title: event.title,
      type: event.type,
      semester: event.semester,
      startDate: event.startDate,
      endDate: event.endDate,
      note: event.note,
      sortOrder: index,
    })),
    sourceTitle: calendar.source.title,
    sourcePublishedAt: calendar.source.publishedAt,
    sourceUrl: calendar.source.url,
    sourceFileRef: calendar.source.fileRef,
    sourceNote: calendar.source.note,
  };
}

function firstCoveredYear(calendar: AcademicCalendarView): number {
  return Math.min(...calendar.studyYears);
}

function holidayKey(event: AcademicCalendarView["events"][number]): string {
  return `${event.title.trim().toLocaleLowerCase()}|${event.startDate}|${event.endDate ?? ""}`;
}

export function AcademicCalendarProgrammeHolidays() {
  const [programmeId, setProgrammeId] = useState("");
  const [currentYear, setCurrentYear] = useState<AcademicYearView | null>(null);
  const [calendars, setCalendars] = useState<AcademicCalendarView[]>([]);
  const [draft, setDraft] = useState<HolidayDraft>(EMPTY_HOLIDAY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [pendingAnchorYear, setPendingAnchorYear] = useState<number | null>(null);

  const load = useCallback(async () => {
    const programme = await academicCalendarApi.programme();
    const years = await academicCalendarApi.years(programme.id);
    const year = years.find((item) => item.isCurrent) ?? years[0] ?? null;
    setProgrammeId(programme.id);
    setCurrentYear(year);
    if (!year) {
      setCalendars([]);
      return;
    }
    setCalendars(await academicCalendarApi.calendars(programme.id, year.id));
  }, []);

  useEffect(() => {
    void load().catch((reason) => setError(errorMessage(reason, "Could not load programme-wide holidays.")));
  }, [load]);

  const publishedCalendars = useMemo(
    () => calendars.filter((calendar) => calendar.status === "Published"),
    [calendars],
  );

  const holidays = useMemo(() => {
    const deduped = new Map<string, AcademicCalendarView["events"][number]>();
    for (const calendar of publishedCalendars) {
      for (const event of calendar.events) {
        if (event.type !== "Holiday") continue;
        const key = holidayKey(event);
        if (!deduped.has(key)) deduped.set(key, event);
      }
    }
    return [...deduped.values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
  }, [publishedCalendars]);

  const addHoliday = async () => {
    if (!programmeId || !currentYear) return;
    if (!draft.title.trim() || !draft.startDate) {
      setError("Holiday title and start date are required.");
      return;
    }
    if (draft.endDate && draft.endDate < draft.startDate) {
      setError("Holiday end date cannot be before its start date.");
      return;
    }

    const anchor = [...publishedCalendars].sort((a, b) => firstCoveredYear(a) - firstCoveredYear(b))[0];
    if (!anchor) {
      setError("Publish at least one study-year calendar before adding official programme-wide holidays.");
      return;
    }

    const existingDraft = calendars.find((calendar) => calendar.status === "Draft" && calendar.seriesKey === anchor.seriesKey);
    if (existingDraft) {
      setError(`Year ${firstCoveredYear(anchor)} already has a correction draft in progress. Finish or publish that draft before adding a programme-wide holiday here.`);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const revision = await academicCalendarApi.revision(
        programmeId,
        anchor.id,
        `Add programme-wide holiday: ${draft.title.trim()}`,
      );
      const payload = calendarPayload(revision);
      payload.events.push({
        title: draft.title.trim(),
        type: "Holiday",
        semester: null,
        startDate: draft.startDate,
        endDate: draft.endDate || null,
        note: draft.note.trim(),
        sortOrder: payload.events.length,
      });
      const updated = await academicCalendarApi.update(programmeId, revision.id, payload);
      setPendingDraftId(updated.id);
      setPendingAnchorYear(firstCoveredYear(anchor));
      setDraft(EMPTY_HOLIDAY);
      setShowForm(false);
      setNotice("Programme-wide holiday saved to a correction draft. Review it, then publish when ready.");
      await load();
    } catch (reason) {
      setError(errorMessage(reason, "Could not add the programme-wide holiday."));
    } finally {
      setSaving(false);
    }
  };

  const publishHolidayRevision = async () => {
    if (!programmeId || !pendingDraftId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await academicCalendarApi.publish(programmeId, pendingDraftId);
      setPendingDraftId(null);
      setPendingAnchorYear(null);
      setNotice("Programme-wide holiday published. It now applies to Years 1–4 on public calendars.");
      await load();
    } catch (reason) {
      setError(errorMessage(reason, "Could not publish the programme-wide holiday revision."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-7xl rounded-2xl border border-border bg-card p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Programme-wide holidays</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Official holidays apply to Years 1–4. Enter each holiday once here; do not duplicate it inside individual study-year calendars.
          </p>
          {currentYear ? <p className="mt-1 text-xs font-medium text-muted-foreground">Academic Year {currentYear.label}</p> : null}
        </div>
        <Button type="button" variant="outline" disabled={!currentYear || saving} onClick={() => { setShowForm((value) => !value); setError(null); }}>
          <Plus className="h-4 w-4" /> Add holiday
        </Button>
      </div>

      {error ? <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {notice ? <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div> : null}

      {showForm ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5 xl:col-span-2">
              <Label htmlFor="programme-holiday-title">Holiday title <span className="text-destructive">* required</span></Label>
              <Input id="programme-holiday-title" required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Khmer New Year" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="programme-holiday-start">Start <span className="text-destructive">* required</span></Label>
              <Input id="programme-holiday-start" required type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="programme-holiday-end">End <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="programme-holiday-end" type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} />
            </div>
            <div className="space-y-1.5 md:col-span-2 xl:col-span-4">
              <Label htmlFor="programme-holiday-note">Note</Label>
              <Input id="programme-holiday-note" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Official public holiday" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setDraft(EMPTY_HOLIDAY); }}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void addHoliday()}>{saving ? "Saving…" : "Save holiday draft"}</Button>
          </div>
        </div>
      ) : null}

      {holidays.length ? (
        <div className="mt-4 divide-y divide-border rounded-xl border border-border">
          {holidays.map((holiday) => (
            <div key={holidayKey(holiday)} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{holiday.title}</p>
                {holiday.note ? <p className="mt-0.5 text-sm text-muted-foreground">{holiday.note}</p> : null}
              </div>
              <div className="text-sm sm:text-right">
                <p className="font-medium">{formatAcademicDate(holiday.startDate)}{holiday.endDate ? ` – ${formatAcademicDate(holiday.endDate)}` : ""}</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Official holiday · Years 1–4</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No programme-wide holidays have been published for this academic year yet.</div>
      )}

      {pendingDraftId ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">Holiday correction draft ready</p>
            <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-200/80">The published calendar is unchanged until this revision is published{pendingAnchorYear ? ` (anchored to Year ${pendingAnchorYear})` : ""}.</p>
          </div>
          <Button type="button" disabled={saving} onClick={() => void publishHolidayRevision()}><CheckCircle2 className="h-4 w-4" /> Publish holiday revision</Button>
        </div>
      ) : null}
    </section>
  );
}
