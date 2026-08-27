"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import type { AcademicCalendarEventInput, AcademicCalendarView, AcademicYearView, UpdateAcademicCalendarDraftInput } from "@dse-pms/shared-types";
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
  if (error instanceof Error) return error.message || fallback;
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

function holidayKey(event: Pick<AcademicCalendarEventInput, "title" | "startDate" | "endDate">): string {
  return `${event.title.trim().toLocaleLowerCase()}|${event.startDate}|${event.endDate ?? ""}`;
}

function toHolidayDraft(event: AcademicCalendarView["events"][number]): HolidayDraft {
  return {
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate ?? "",
    note: event.note,
  };
}

export function AcademicCalendarProgrammeHolidays() {
  const [programmeId, setProgrammeId] = useState("");
  const [currentYear, setCurrentYear] = useState<AcademicYearView | null>(null);
  const [calendars, setCalendars] = useState<AcademicCalendarView[]>([]);
  const [draft, setDraft] = useState<HolidayDraft>(EMPTY_HOLIDAY);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const anchor = useMemo(
    () => [...publishedCalendars].sort((a, b) => firstCoveredYear(a) - firstCoveredYear(b))[0] ?? null,
    [publishedCalendars],
  );

  const currentCorrectionDraft = useMemo(() => {
    if (!anchor) return null;
    return calendars.find((calendar) =>
      calendar.status === "Draft"
      && calendar.seriesKey === anchor.seriesKey
      && calendar.supersedesCalendarId === anchor.id,
    ) ?? null;
  }, [anchor, calendars]);

  const publishedHolidays = useMemo(() => {
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

  const draftHolidays = useMemo(
    () => (currentCorrectionDraft?.events ?? [])
      .filter((event) => event.type === "Holiday")
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title)),
    [currentCorrectionDraft],
  );

  const publishedHolidayKeys = useMemo(
    () => new Set(publishedHolidays.map(holidayKey)),
    [publishedHolidays],
  );

  const resetForm = () => {
    setDraft(EMPTY_HOLIDAY);
    setEditingKey(null);
    setShowForm(false);
  };

  const ensureHolidayDraft = async (): Promise<AcademicCalendarView> => {
    if (currentCorrectionDraft) return currentCorrectionDraft;
    if (!anchor) throw new Error("Publish at least one study-year calendar before managing official programme-wide holidays.");
    return academicCalendarApi.revision(
      programmeId,
      anchor.id,
      "Manage programme-wide holidays",
    );
  };

  const saveHoliday = async () => {
    if (!programmeId || !currentYear) return;
    if (!draft.title.trim() || !draft.startDate) {
      setError("Holiday title and start date are required.");
      return;
    }
    if (draft.endDate && draft.endDate < draft.startDate) {
      setError("Holiday end date cannot be before its start date.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const correction = await ensureHolidayDraft();
      const payload = calendarPayload(correction);
      const events = payload.events.filter((event) => event.type !== "Holiday" || holidayKey(event) !== editingKey);
      const candidate: AcademicCalendarEventInput = {
        title: draft.title.trim(),
        type: "Holiday",
        semester: null,
        startDate: draft.startDate,
        endDate: draft.endDate || null,
        note: draft.note.trim(),
        sortOrder: events.length,
      };
      const duplicate = events.some((event) => event.type === "Holiday" && holidayKey(event) === holidayKey(candidate));
      if (duplicate) throw new Error("This holiday already exists in the correction draft.");
      payload.events = [...events, candidate].map((event, index) => ({ ...event, sortOrder: index }));
      await academicCalendarApi.update(programmeId, correction.id, payload);
      resetForm();
      setNotice(editingKey ? "Holiday updated in the correction draft." : "Holiday added to the correction draft.");
      await load();
    } catch (reason) {
      setError(errorMessage(reason, "Could not save the programme-wide holiday."));
    } finally {
      setSaving(false);
    }
  };

  const editHoliday = (event: AcademicCalendarView["events"][number]) => {
    setDraft(toHolidayDraft(event));
    setEditingKey(holidayKey(event));
    setShowForm(true);
    setError(null);
    setNotice(null);
  };

  const removeHoliday = async (event: AcademicCalendarView["events"][number]) => {
    if (!programmeId || !currentCorrectionDraft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const key = holidayKey(event);
      const payload = calendarPayload(currentCorrectionDraft);
      payload.events = payload.events
        .filter((item) => item.type !== "Holiday" || holidayKey(item) !== key)
        .map((item, index) => ({ ...item, sortOrder: index }));
      await academicCalendarApi.update(programmeId, currentCorrectionDraft.id, payload);
      if (editingKey === key) resetForm();
      setNotice("Holiday removed from the correction draft. The published holiday remains official until the correction is published.");
      await load();
    } catch (reason) {
      setError(errorMessage(reason, "Could not remove the programme-wide holiday."));
    } finally {
      setSaving(false);
    }
  };

  const publishHolidayRevision = async () => {
    if (!programmeId || !currentCorrectionDraft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await academicCalendarApi.publish(programmeId, currentCorrectionDraft.id);
      resetForm();
      setNotice("Programme-wide holiday correction published. The official holiday list now applies to Years 1–4.");
      await load();
    } catch (reason) {
      setError(errorMessage(reason, "Could not publish the programme-wide holiday correction."));
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
            Official holidays apply to Years 1–4. Draft changes are reviewed here before they become official.
          </p>
          {currentYear ? <p className="mt-1 text-xs font-medium text-muted-foreground">Academic Year {currentYear.label}</p> : null}
        </div>
        <Button type="button" variant="outline" disabled={!currentYear || saving || !anchor} onClick={() => { setShowForm(true); setEditingKey(null); setDraft(EMPTY_HOLIDAY); setError(null); }}>
          <Plus className="h-4 w-4" /> Add holiday
        </Button>
      </div>

      {error ? <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {notice ? <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div> : null}

      {showForm ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
          <p className="mb-3 font-medium">{editingKey ? "Edit draft holiday" : "Add holiday to draft"}</p>
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
            <Button type="button" variant="ghost" disabled={saving} onClick={resetForm}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void saveHoliday()}>{saving ? "Saving…" : editingKey ? "Save changes" : "Add to draft"}</Button>
          </div>
        </div>
      ) : null}

      {currentCorrectionDraft ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <div className="flex flex-col gap-3 border-b border-amber-500/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">Holiday correction draft</p>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200">Draft · Year {firstCoveredYear(currentCorrectionDraft)}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{draftHolidays.length} holiday{draftHolidays.length === 1 ? "" : "s"} in the current correction. Edit this list before publishing.</p>
            </div>
            <Button type="button" disabled={saving} onClick={() => void publishHolidayRevision()}>
              <CheckCircle2 className="h-4 w-4" /> Publish correction
            </Button>
          </div>
          {draftHolidays.length ? (
            <div className="divide-y divide-border">
              {draftHolidays.map((holiday) => {
                const key = holidayKey(holiday);
                const alreadyOfficial = publishedHolidayKeys.has(key);
                return (
                  <div key={key} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{holiday.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${alreadyOfficial ? "bg-muted text-muted-foreground" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>
                          {alreadyOfficial ? "Already official" : "Pending"}
                        </span>
                      </div>
                      {holiday.note ? <p className="mt-0.5 text-sm text-muted-foreground">{holiday.note}</p> : null}
                      <p className="mt-1 text-sm font-medium">{formatAcademicDate(holiday.startDate)}{holiday.endDate ? ` – ${formatAcademicDate(holiday.endDate)}` : ""}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => editHoliday(holiday)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                      <Button type="button" size="sm" variant="destructive" disabled={saving} onClick={() => void removeHoliday(holiday)}><Trash2 className="h-3.5 w-3.5" /> Remove</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-5 text-center text-sm text-muted-foreground">This correction draft currently contains no holidays. Add one manually or import holiday JSON below.</div>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          No holiday correction draft is open. Add a holiday or import holiday JSON to start one.
        </div>
      )}

      <div className="mt-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold">Official published holidays</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">Read-only until a correction draft is published.</p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">{publishedHolidays.length} published</span>
        </div>
        {publishedHolidays.length ? (
          <div className="divide-y divide-border rounded-xl border border-border">
            {publishedHolidays.map((holiday) => (
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
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No programme-wide holidays have been published for this academic year yet.</div>
        )}
      </div>
    </section>
  );
}
