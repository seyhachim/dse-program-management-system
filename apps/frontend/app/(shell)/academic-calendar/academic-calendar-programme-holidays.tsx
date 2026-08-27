"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import type { AcademicCalendarView, AcademicYearView, UpdateAcademicCalendarDraftInput } from "@dse-pms/shared-types";
import { Button, Input, Label } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { academicCalendarApi, formatAcademicDate } from "@/lib/academic-calendar";

type HolidayForm = {
  title: string;
  startDate: string;
  endDate: string;
  note: string;
};

const EMPTY_HOLIDAY: HolidayForm = { title: "", startDate: "", endDate: "", note: "" };

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

function holidayKey(event: Pick<AcademicCalendarView["events"][number], "title" | "startDate" | "endDate">): string {
  return `${event.title.trim().toLocaleLowerCase()}|${event.startDate}|${event.endDate ?? ""}`;
}

function holidayForm(event: AcademicCalendarView["events"][number]): HolidayForm {
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
  const [form, setForm] = useState<HolidayForm>(EMPTY_HOLIDAY);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
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

  const publishedHolidayKeys = useMemo(
    () => new Set(publishedHolidays.map(holidayKey)),
    [publishedHolidays],
  );

  const draftHolidays = useMemo(
    () => (currentCorrectionDraft?.events ?? [])
      .filter((event) => event.type === "Holiday")
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title)),
    [currentCorrectionDraft],
  );

  const resetForm = () => {
    setForm(EMPTY_HOLIDAY);
    setEditingEventId(null);
    setShowForm(false);
  };

  const openAddForm = () => {
    setError(null);
    setNotice(null);
    setForm(EMPTY_HOLIDAY);
    setEditingEventId(null);
    setShowForm(true);
  };

  const openEditForm = (event: AcademicCalendarView["events"][number]) => {
    setError(null);
    setNotice(null);
    setForm(holidayForm(event));
    setEditingEventId(event.id);
    setShowForm(true);
  };

  const ensureDraft = async (): Promise<AcademicCalendarView> => {
    if (currentCorrectionDraft) return currentCorrectionDraft;
    if (!anchor) throw new Error("Publish at least one study-year calendar before adding programme-wide holidays.");
    return academicCalendarApi.revision(
      programmeId,
      anchor.id,
      "Manage programme-wide holidays",
    );
  };

  const saveHoliday = async () => {
    if (!programmeId || !currentYear) return;
    if (!form.title.trim() || !form.startDate) {
      setError("Holiday title and start date are required.");
      return;
    }
    if (form.endDate && form.endDate < form.startDate) {
      setError("Holiday end date cannot be before its start date.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const targetDraft = await ensureDraft();
      const payload = calendarPayload(targetDraft);
      const nextHoliday = {
        title: form.title.trim(),
        type: "Holiday" as const,
        semester: null,
        startDate: form.startDate,
        endDate: form.endDate || null,
        note: form.note.trim(),
        sortOrder: 0,
      };

      if (editingEventId) {
        const sourceIndex = targetDraft.events.findIndex((event) => event.id === editingEventId);
        if (sourceIndex < 0) throw new Error("The holiday being edited is no longer present in this draft. Reload and try again.");
        payload.events[sourceIndex] = { ...nextHoliday, sortOrder: sourceIndex };
      } else {
        const duplicate = payload.events.some((event) => event.type === "Holiday" && holidayKey(event) === holidayKey(nextHoliday));
        if (duplicate) throw new Error("That holiday is already present in the current draft.");
        payload.events.push({ ...nextHoliday, sortOrder: payload.events.length });
      }

      await academicCalendarApi.update(programmeId, targetDraft.id, payload);
      resetForm();
      setNotice(editingEventId ? "Draft holiday updated. Nothing public changed yet." : "Holiday added to the correction draft. Nothing public changed yet.");
      await load();
    } catch (reason) {
      setError(errorMessage(reason, editingEventId ? "Could not update the draft holiday." : "Could not add the draft holiday."));
    } finally {
      setSaving(false);
    }
  };

  const removeHoliday = async (event: AcademicCalendarView["events"][number]) => {
    if (!programmeId || !currentCorrectionDraft) return;
    const confirmed = window.confirm(`Remove “${event.title}” from the correction draft? Published data will remain unchanged until this draft is published.`);
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = calendarPayload(currentCorrectionDraft);
      const sourceIndex = currentCorrectionDraft.events.findIndex((item) => item.id === event.id);
      if (sourceIndex < 0) throw new Error("The holiday is no longer present in this draft. Reload and try again.");
      payload.events.splice(sourceIndex, 1);
      payload.events = payload.events.map((item, index) => ({ ...item, sortOrder: index }));
      await academicCalendarApi.update(programmeId, currentCorrectionDraft.id, payload);
      if (editingEventId === event.id) resetForm();
      setNotice("Holiday removed from the correction draft. Published holidays are unchanged until you publish the draft.");
      await load();
    } catch (reason) {
      setError(errorMessage(reason, "Could not remove the draft holiday."));
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
      setNotice("Holiday correction published. The official programme-wide holiday list now applies to Years 1–4.");
      await load();
    } catch (reason) {
      setError(errorMessage(reason, "Could not publish the holiday correction draft."));
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
            Official holidays apply to Years 1–4. Draft changes stay private until the correction revision is published.
          </p>
          {currentYear ? <p className="mt-1 text-xs font-medium text-muted-foreground">Academic Year {currentYear.label}</p> : null}
        </div>
        <Button type="button" variant="outline" disabled={!currentYear || saving || !anchor} onClick={openAddForm}>
          <Plus className="h-4 w-4" /> Add holiday
        </Button>
      </div>

      {error ? <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {notice ? <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div> : null}

      {currentCorrectionDraft ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">Holiday correction draft</p>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">Draft · Year {firstCoveredYear(currentCorrectionDraft)}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Review, add, edit, or remove holidays here. Semester dates and other correction-draft work are preserved.
              </p>
            </div>
            <Button type="button" disabled={saving} onClick={() => void publishHolidayRevision()}>
              <CheckCircle2 className="h-4 w-4" /> Publish correction
            </Button>
          </div>

          {draftHolidays.length ? (
            <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-background">
              {draftHolidays.map((holiday) => {
                const alreadyPublished = publishedHolidayKeys.has(holidayKey(holiday));
                return (
                  <div key={holiday.id} className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{holiday.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${alreadyPublished ? "bg-muted text-muted-foreground" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>
                          {alreadyPublished ? "Already official" : "Pending"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatAcademicDate(holiday.startDate)}{holiday.endDate ? ` – ${formatAcademicDate(holiday.endDate)}` : ""}
                        {holiday.note ? ` · ${holiday.note}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" variant="outline" disabled={saving} onClick={() => openEditForm(holiday)}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                      <Button type="button" variant="outline" disabled={saving} onClick={() => void removeHoliday(holiday)}>
                        <Trash2 className="h-4 w-4" /> Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
              This correction draft currently contains no programme-wide holidays. Use Add holiday to add one.
            </div>
          )}
        </div>
      ) : null}

      {showForm ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
          <p className="mb-3 font-medium">{editingEventId ? "Edit draft holiday" : "Add holiday to correction draft"}</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5 xl:col-span-2">
              <Label htmlFor="programme-holiday-title">Holiday title <span className="text-destructive">* required</span></Label>
              <Input id="programme-holiday-title" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Khmer New Year" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="programme-holiday-start">Start <span className="text-destructive">* required</span></Label>
              <Input id="programme-holiday-start" required type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="programme-holiday-end">End <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="programme-holiday-end" type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
            </div>
            <div className="space-y-1.5 md:col-span-2 xl:col-span-4">
              <Label htmlFor="programme-holiday-note">Note</Label>
              <Input id="programme-holiday-note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Official public holiday" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={saving} onClick={resetForm}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void saveHoliday()}>{saving ? "Saving…" : editingEventId ? "Save changes" : "Add to draft"}</Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Official published holidays</p>
            <p className="mt-0.5 text-sm text-muted-foreground">These are currently visible on public calendars for Years 1–4.</p>
          </div>
          <span className="text-sm text-muted-foreground">{publishedHolidays.length} published</span>
        </div>

        {publishedHolidays.length ? (
          <div className="mt-3 divide-y divide-border rounded-xl border border-border">
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
          <div className="mt-3 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            No programme-wide holidays have been published for this academic year yet.
          </div>
        )}
      </div>
    </section>
  );
}
