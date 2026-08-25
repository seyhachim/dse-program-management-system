"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, FileText, History, Plus, RefreshCw, Trash2 } from "lucide-react";
import type {
  AcademicCalendarEventInput,
  AcademicCalendarEventType,
  AcademicCalendarPeriodInput,
  AcademicCalendarView,
  AcademicYearView,
} from "@dse-pms/shared-types";
import { ACADEMIC_CALENDAR_EVENT_TYPES } from "@dse-pms/shared-types";
import { Button, Input, Label } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import {
  academicCalendarApi,
  academicSemesterLabel,
  formatAcademicDate,
} from "@/lib/academic-calendar";

const STUDY_YEARS = [1, 2, 3, 4] as const;
const SEMESTERS = ["First", "Second"] as const;

type PeriodDraft = {
  semester: "First" | "Second";
  enabled: boolean;
  teachingStart: string;
  teachingEnd: string;
  examStart: string;
  examEnd: string;
  breakStart: string;
  breakEnd: string;
};

type EventDraft = {
  key: string;
  title: string;
  type: AcademicCalendarEventType;
  semester: "" | "First" | "Second";
  startDate: string;
  endDate: string;
  note: string;
};

type CalendarDraft = {
  studyYears: number[];
  periods: PeriodDraft[];
  events: EventDraft[];
  sourceTitle: string;
  sourcePublishedAt: string;
  sourceUrl: string;
  sourceFileRef: string;
  sourceNote: string;
};

function emptyPeriod(semester: "First" | "Second", enabled = semester === "First"): PeriodDraft {
  return {
    semester,
    enabled,
    teachingStart: "",
    teachingEnd: "",
    examStart: "",
    examEnd: "",
    breakStart: "",
    breakEnd: "",
  };
}

function emptyDraft(studyYear = 1): CalendarDraft {
  return {
    studyYears: [studyYear],
    periods: [emptyPeriod("First", true), emptyPeriod("Second", false)],
    events: [],
    sourceTitle: "",
    sourcePublishedAt: "",
    sourceUrl: "",
    sourceFileRef: "",
    sourceNote: "",
  };
}

function fromCalendar(calendar: AcademicCalendarView): CalendarDraft {
  const bySemester = new Map(calendar.periods.map((period) => [period.semester, period]));
  return {
    studyYears: [...calendar.studyYears],
    periods: SEMESTERS.map((semester) => {
      const period = bySemester.get(semester);
      return period
        ? {
            semester,
            enabled: true,
            teachingStart: period.teachingStart,
            teachingEnd: period.teachingEnd,
            examStart: period.examStart ?? "",
            examEnd: period.examEnd ?? "",
            breakStart: period.breakStart ?? "",
            breakEnd: period.breakEnd ?? "",
          }
        : emptyPeriod(semester, false);
    }),
    events: calendar.events.map((event) => ({
      key: event.id,
      title: event.title,
      type: event.type,
      semester: event.semester ?? "",
      startDate: event.startDate,
      endDate: event.endDate ?? "",
      note: event.note,
    })),
    sourceTitle: calendar.source.title,
    sourcePublishedAt: calendar.source.publishedAt ?? "",
    sourceUrl: calendar.source.url ?? "",
    sourceFileRef: calendar.source.fileRef ?? "",
    sourceNote: calendar.source.note,
  };
}

function statusClasses(status: AcademicCalendarView["status"]): string {
  if (status === "Published") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "Draft") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted text-muted-foreground";
}

function message(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}

function enabledPeriods(draft: CalendarDraft): AcademicCalendarPeriodInput[] {
  return draft.periods
    .filter((period) => period.enabled)
    .map((period) => ({
      semester: period.semester,
      teachingStart: period.teachingStart,
      teachingEnd: period.teachingEnd,
      examStart: period.examStart || null,
      examEnd: period.examEnd || null,
      breakStart: period.breakStart || null,
      breakEnd: period.breakEnd || null,
    }));
}

function eventPayload(draft: CalendarDraft): AcademicCalendarEventInput[] {
  return draft.events.map((event, index) => ({
    title: event.title,
    type: event.type,
    semester: event.semester || null,
    startDate: event.startDate,
    endDate: event.endDate || null,
    note: event.note,
    sortOrder: index,
  }));
}

function CalendarSummary({ calendar }: { calendar: AcademicCalendarView }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(calendar.status)}`}>
          {calendar.status}
        </span>
        <span className="text-sm text-muted-foreground">Revision {calendar.revision}</span>
        <span className="text-sm text-muted-foreground">Years {calendar.studyYears.join(", ")}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {calendar.periods.map((period) => (
          <section key={period.id} className="rounded-xl border border-border bg-muted/20 p-4">
            <h4 className="font-semibold">{academicSemesterLabel(period.semester)}</h4>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Teaching</dt><dd className="text-right font-medium">{formatAcademicDate(period.teachingStart)} – {formatAcademicDate(period.teachingEnd)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Exams</dt><dd className="text-right">{period.examStart ? `${formatAcademicDate(period.examStart)} – ${formatAcademicDate(period.examEnd)}` : "Not set"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Break</dt><dd className="text-right">{period.breakStart ? `${formatAcademicDate(period.breakStart)} – ${formatAcademicDate(period.breakEnd)}` : "Not set"}</dd></div>
            </dl>
          </section>
        ))}
      </div>
      {calendar.events.length > 0 ? (
        <section>
          <h4 className="font-semibold">Additional events</h4>
          <div className="mt-2 divide-y divide-border rounded-xl border border-border">
            {calendar.events.map((event) => (
              <div key={event.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-medium">{event.title}</p><p className="text-xs text-muted-foreground">{event.type}{event.semester ? ` · ${academicSemesterLabel(event.semester)}` : ""}</p></div>
                <p className="text-sm">{formatAcademicDate(event.startDate)}{event.endDate ? ` – ${formatAcademicDate(event.endDate)}` : ""}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="rounded-xl border border-border p-4">
        <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h4 className="font-semibold">Official source</h4></div>
        <p className="mt-2 text-sm font-medium">{calendar.source.title || "No source title yet"}</p>
        <p className="mt-1 text-sm text-muted-foreground">{calendar.source.publishedAt ? `Issued ${formatAcademicDate(calendar.source.publishedAt)}` : "Issue date not recorded"}</p>
        {calendar.source.url ? <a className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline" href={calendar.source.url} target="_blank" rel="noreferrer">Open source link</a> : null}
        {calendar.source.note ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{calendar.source.note}</p> : null}
      </section>
    </div>
  );
}

function CalendarEditor({
  draft,
  setDraft,
}: {
  draft: CalendarDraft;
  setDraft: (next: CalendarDraft) => void;
}) {
  const updatePeriod = (semester: "First" | "Second", patch: Partial<PeriodDraft>) => {
    setDraft({ ...draft, periods: draft.periods.map((period) => period.semester === semester ? { ...period, ...patch } : period) });
  };
  const updateEvent = (key: string, patch: Partial<EventDraft>) => {
    setDraft({ ...draft, events: draft.events.map((event) => event.key === key ? { ...event, ...patch } : event) });
  };

  return (
    <div className="space-y-6">
      <fieldset className="rounded-2xl border border-border bg-muted/10 p-4">
        <legend className="px-1 text-sm font-semibold"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span>Study year coverage</legend>
        <p className="mt-1 text-xs text-muted-foreground">Select one year or intentionally share one calendar across multiple study years.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {STUDY_YEARS.map((year) => (
            <label key={year} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={draft.studyYears.includes(year)}
                onChange={(event) => setDraft({
                  ...draft,
                  studyYears: event.target.checked
                    ? [...draft.studyYears, year].sort((a, b) => a - b)
                    : draft.studyYears.filter((value) => value !== year),
                })}
              />
              Year {year}
            </label>
          ))}
        </div>
      </fieldset>

      <section>
        <div className="mb-3"><h4 className="text-sm font-semibold"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">2</span>Semester dates</h4><p className="mt-1 text-xs text-muted-foreground">Teaching dates are canonical. Exam and break windows stay optional until officially issued.</p></div>
      <div className="grid gap-4 xl:grid-cols-2">
        {draft.periods.map((period) => (
          <fieldset key={period.semester} className="rounded-xl border border-border p-4">
            <legend className="px-1 font-semibold">{academicSemesterLabel(period.semester)}</legend>
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={period.enabled} onChange={(event) => updatePeriod(period.semester, { enabled: event.target.checked })} />
              Include this semester
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ["teachingStart", "Teaching start"], ["teachingEnd", "Teaching end"],
                ["examStart", "Exam start"], ["examEnd", "Exam end"],
                ["breakStart", "Break start"], ["breakEnd", "Break end"],
              ] as const).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`${period.semester}-${key}`}>{label}</Label>
                  <Input
                    id={`${period.semester}-${key}`}
                    type="date"
                    disabled={!period.enabled}
                    value={period[key]}
                    onChange={(event) => updatePeriod(period.semester, { [key]: event.target.value })}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      </section>

      <section className="rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div><h4 className="font-semibold"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">3</span>Academic events</h4><p className="text-sm text-muted-foreground">Registration, orientation, holidays, midterms, or other official dates.</p></div>
          <Button type="button" variant="outline" onClick={() => setDraft({
            ...draft,
            events: [...draft.events, { key: crypto.randomUUID(), title: "", type: "Other", semester: "", startDate: "", endDate: "", note: "" }],
          })}><Plus className="h-4 w-4" /> Add event</Button>
        </div>
        <div className="mt-4 space-y-3">
          {draft.events.length === 0 ? <p className="text-sm text-muted-foreground">No additional events.</p> : draft.events.map((event) => (
            <div key={event.key} className="grid gap-3 rounded-lg bg-muted/30 p-3 md:grid-cols-6">
              <div className="md:col-span-2"><Label htmlFor={`${event.key}-title`}>Title</Label><Input id={`${event.key}-title`} className="mt-1" value={event.title} onChange={(e) => updateEvent(event.key, { title: e.target.value })} /></div>
              <div><Label htmlFor={`${event.key}-type`}>Type</Label><select id={`${event.key}-type`} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={event.type} onChange={(e) => updateEvent(event.key, { type: e.target.value as AcademicCalendarEventType })}>{ACADEMIC_CALENDAR_EVENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
              <div><Label htmlFor={`${event.key}-semester`}>Semester</Label><select id={`${event.key}-semester`} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={event.semester} onChange={(e) => updateEvent(event.key, { semester: e.target.value as EventDraft["semester"] })}><option value="">Any</option><option value="First">Semester 1</option><option value="Second">Semester 2</option></select></div>
              <div><Label htmlFor={`${event.key}-start`}>Start</Label><Input id={`${event.key}-start`} className="mt-1" type="date" value={event.startDate} onChange={(e) => updateEvent(event.key, { startDate: e.target.value })} /></div>
              <div><Label htmlFor={`${event.key}-end`}>End</Label><Input id={`${event.key}-end`} className="mt-1" type="date" value={event.endDate} onChange={(e) => updateEvent(event.key, { endDate: e.target.value })} /></div>
              <div className="md:col-span-5"><Label htmlFor={`${event.key}-note`}>Note</Label><Input id={`${event.key}-note`} className="mt-1" value={event.note} onChange={(e) => updateEvent(event.key, { note: e.target.value })} /></div>
              <div className="flex items-end"><Button type="button" variant="ghost" onClick={() => setDraft({ ...draft, events: draft.events.filter((item) => item.key !== event.key) })}><Trash2 className="h-4 w-4" /> Remove</Button></div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-primary/20 bg-primary/[0.025] p-4">
        <h4 className="font-semibold"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">4</span>Official source / provenance</h4>
        <p className="mt-1 text-sm text-muted-foreground">A source is required before publication. Use a URL, managed file reference, or explanatory source note.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="source-title">Source title</Label><Input id="source-title" value={draft.sourceTitle} onChange={(e) => setDraft({ ...draft, sourceTitle: e.target.value })} placeholder="RUPP Academic Calendar 2026–2027" /></div>
          <div className="space-y-1.5"><Label htmlFor="source-date">Issue / published date</Label><Input id="source-date" type="date" value={draft.sourcePublishedAt} onChange={(e) => setDraft({ ...draft, sourcePublishedAt: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="source-url">Source URL</Label><Input id="source-url" type="url" value={draft.sourceUrl} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} placeholder="https://…" /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="source-file">Managed file reference (optional)</Label><Input id="source-file" value={draft.sourceFileRef} onChange={(e) => setDraft({ ...draft, sourceFileRef: e.target.value })} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="source-note">Source note</Label><textarea id="source-note" className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={draft.sourceNote} onChange={(e) => setDraft({ ...draft, sourceNote: e.target.value })} placeholder="Record where the official dates came from and any interpretation needed." /></div>
        </div>
      </section>
    </div>
  );
}

export function AcademicCalendarClient() {
  const [programmeId, setProgrammeId] = useState("");
  const [programmeName, setProgrammeName] = useState("");
  const [years, setYears] = useState<AcademicYearView[]>([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [calendars, setCalendars] = useState<AcademicCalendarView[]>([]);
  const [selectedStudyYear, setSelectedStudyYear] = useState<number>(1);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [draft, setDraft] = useState<CalendarDraft>(() => emptyDraft());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revisionReason, setRevisionReason] = useState("");
  const [auditRows, setAuditRows] = useState<Array<{ id: string; action: string; actorName: string; reason: string; createdAt: string }>>([]);
  const [newYear, setNewYear] = useState({ label: "", startYear: "", endYear: "" });
  const [showNewYear, setShowNewYear] = useState(false);

  const selectedYear = years.find((year) => year.id === selectedYearId) ?? null;
  const calendarForStudyYear = useMemo(() => {
    const candidates = calendars.filter((calendar) => calendar.studyYears.includes(selectedStudyYear));
    return candidates.find((calendar) => calendar.status === "Published")
      ?? candidates.find((calendar) => calendar.status === "Draft")
      ?? candidates[0]
      ?? null;
  }, [calendars, selectedStudyYear]);
  const selectedCalendar = calendars.find((calendar) => calendar.id === selectedCalendarId) ?? calendarForStudyYear;
  const yearCoverage = STUDY_YEARS.map((year) => {
    const matches = calendars.filter((calendar) => calendar.studyYears.includes(year));
    const calendar = matches.find((item) => item.status === "Published")
      ?? matches.find((item) => item.status === "Draft")
      ?? matches[0]
      ?? null;
    return { year, calendar };
  });
  const publishedCoverage = yearCoverage.filter((item) => item.calendar?.status === "Published").length;
  const draftCoverage = yearCoverage.filter((item) => item.calendar?.status === "Draft").length;
  const missingCoverage = yearCoverage.filter((item) => !item.calendar).length;

  const loadCalendars = useCallback(async (programme: string, academicYearId: string) => {
    const data = await academicCalendarApi.calendars(programme, academicYearId);
    setCalendars(data);
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const programme = await academicCalendarApi.programme();
      setProgrammeId(programme.id); setProgrammeName(programme.name);
      const academicYears = await academicCalendarApi.years(programme.id);
      setYears(academicYears);
      const preferred = academicYears.find((year) => year.isCurrent) ?? academicYears[0] ?? null;
      setSelectedYearId(preferred?.id ?? "");
      if (preferred) await loadCalendars(programme.id, preferred.id);
      else setCalendars([]);
    } catch (reason) { setError(message(reason, "Could not load Academic Calendar.")); }
    finally { setLoading(false); }
  }, [loadCalendars]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selectedCalendar) { setSelectedCalendarId(""); setAuditRows([]); return; }
    setSelectedCalendarId(selectedCalendar.id);
    if (!editing && !creating) setDraft(fromCalendar(selectedCalendar));
    void academicCalendarApi.audit(programmeId, selectedCalendar.id)
      .then((rows) => setAuditRows(rows))
      .catch(() => setAuditRows([]));
  }, [selectedCalendar?.id, programmeId, editing, creating]);

  const changeAcademicYear = async (academicYearId: string) => {
    setSelectedYearId(academicYearId); setSelectedCalendarId(""); setCreating(false); setEditing(false); setError(null); setNotice(null);
    if (!programmeId || !academicYearId) { setCalendars([]); return; }
    try { await loadCalendars(programmeId, academicYearId); }
    catch (reason) { setError(message(reason, "Could not load calendars for this academic year.")); }
  };

  const startCreate = () => {
    setCreating(true); setEditing(true); setSelectedCalendarId(""); setDraft(emptyDraft(selectedStudyYear)); setError(null); setNotice(null);
  };

  const saveDraft = async () => {
    if (!programmeId || !selectedYearId) return;
    if (draft.studyYears.length === 0) { setError("Select at least one study year."); return; }
    const periods = enabledPeriods(draft);
    if (periods.length === 0 || periods.some((period) => !period.teachingStart || !period.teachingEnd)) {
      setError("Include at least one semester and enter its teaching start and end dates."); return;
    }
    setSaving(true); setError(null); setNotice(null);
    const payload = {
      studyYears: draft.studyYears,
      periods,
      events: eventPayload(draft),
      sourceTitle: draft.sourceTitle,
      sourcePublishedAt: draft.sourcePublishedAt || null,
      sourceUrl: draft.sourceUrl || null,
      sourceFileRef: draft.sourceFileRef || null,
      sourceNote: draft.sourceNote,
    };
    try {
      const saved = creating
        ? await academicCalendarApi.create(programmeId, { academicYearId: selectedYearId, revisionReason: "", ...payload })
        : await academicCalendarApi.update(programmeId, selectedCalendarId, payload);
      await loadCalendars(programmeId, selectedYearId);
      setSelectedCalendarId(saved.id); setCreating(false); setEditing(false); setNotice("Draft saved.");
    } catch (reason) { setError(message(reason, "Could not save the calendar draft.")); }
    finally { setSaving(false); }
  };

  const publish = async () => {
    if (!programmeId || !selectedCalendar || selectedCalendar.status !== "Draft") return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const published = await academicCalendarApi.publish(programmeId, selectedCalendar.id);
      await loadCalendars(programmeId, selectedYearId);
      setSelectedCalendarId(published.id); setEditing(false); setNotice("Calendar published. Offerings and student reads can now use this official revision.");
    } catch (reason) { setError(message(reason, "Could not publish the calendar.")); }
    finally { setSaving(false); }
  };

  const createRevision = async () => {
    if (!programmeId || !selectedCalendar || selectedCalendar.status !== "Published") return;
    if (revisionReason.trim().length < 3) { setError("Enter a correction reason of at least 3 characters."); return; }
    setSaving(true); setError(null); setNotice(null);
    try {
      const revision = await academicCalendarApi.revision(programmeId, selectedCalendar.id, revisionReason.trim());
      await loadCalendars(programmeId, selectedYearId);
      setSelectedCalendarId(revision.id); setDraft(fromCalendar(revision)); setEditing(true); setCreating(false); setRevisionReason("");
      setNotice("Correction revision created. The published calendar remains unchanged until this draft is published.");
    } catch (reason) { setError(message(reason, "Could not create a correction revision.")); }
    finally { setSaving(false); }
  };

  const createAcademicYear = async () => {
    if (!programmeId) return;
    const startYear = Number(newYear.startYear); const endYear = Number(newYear.endYear);
    if (!newYear.label.trim() || !Number.isInteger(startYear) || !Number.isInteger(endYear)) { setError("Enter a label, start year, and end year."); return; }
    setSaving(true); setError(null);
    try {
      const created = await academicCalendarApi.createYear(programmeId, { label: newYear.label.trim(), startYear, endYear, isCurrent: years.length === 0 });
      const nextYears = await academicCalendarApi.years(programmeId); setYears(nextYears); setSelectedYearId(created.id); setCalendars([]); setShowNewYear(false); setNewYear({ label: "", startYear: "", endYear: "" }); setNotice("Academic year created.");
    } catch (reason) { setError(message(reason, "Could not create academic year.")); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading Academic Calendar…</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{programmeName || "Programme"}</p>
            <h2 className="mt-1 text-xl font-semibold">Academic Calendar workspace</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Manage one official source of semester dates. Draft safely, review coverage by study year, then publish an immutable revision.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-56 space-y-1.5"><Label htmlFor="academic-year">Academic Year</Label><select id="academic-year" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedYearId} onChange={(e) => void changeAcademicYear(e.target.value)}><option value="">Select year</option>{years.map((year) => <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? " · Current" : ""}</option>)}</select></div>
            <Button variant="outline" onClick={() => setShowNewYear((value) => !value)}><Plus className="h-4 w-4" /> Academic Year</Button>
            {selectedYear && !selectedYear.isCurrent ? <Button variant="outline" onClick={() => void academicCalendarApi.setCurrentYear(programmeId, selectedYear.id).then(load)}><RefreshCw className="h-4 w-4" /> Set current</Button> : null}
          </div>
        </div>
        {selectedYear ? (
          <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div className="rounded-xl bg-emerald-500/8 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Published coverage</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{publishedCoverage}<span className="text-sm font-medium text-muted-foreground"> / 4 years</span></p>
            </div>
            <div className="rounded-xl bg-amber-500/8 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Draft coverage</p>
              <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">{draftCoverage}</p>
            </div>
            <div className="rounded-xl bg-muted/50 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Not available</p>
              <p className="mt-1 text-2xl font-bold">{missingCoverage}</p>
            </div>
          </div>
        ) : null}
        {showNewYear ? <div className="mt-4 grid gap-3 rounded-xl bg-muted/30 p-4 sm:grid-cols-4"><div><Label htmlFor="new-year-label">Label</Label><Input id="new-year-label" className="mt-1" value={newYear.label} onChange={(e) => setNewYear({ ...newYear, label: e.target.value })} placeholder="2026–2027" /></div><div><Label htmlFor="new-year-start">Start year</Label><Input id="new-year-start" className="mt-1" inputMode="numeric" value={newYear.startYear} onChange={(e) => setNewYear({ ...newYear, startYear: e.target.value })} /></div><div><Label htmlFor="new-year-end">End year</Label><Input id="new-year-end" className="mt-1" inputMode="numeric" value={newYear.endYear} onChange={(e) => setNewYear({ ...newYear, endYear: e.target.value })} /></div><div className="flex items-end"><Button disabled={saving} onClick={() => void createAcademicYear()}>Create year</Button></div></div> : null}
      </section>

      {error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div> : null}

      {!selectedYear ? (
        <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center"><CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">No academic year configured</h3><p className="mt-1 text-sm text-muted-foreground">Create an Academic Year before adding official calendars.</p></section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {STUDY_YEARS.map((year) => {
              const candidates = calendars.filter((calendar) => calendar.studyYears.includes(year));
              const calendar = candidates.find((item) => item.status === "Published") ?? candidates.find((item) => item.status === "Draft") ?? candidates[0];
              return <button key={year} type="button" onClick={() => { setSelectedStudyYear(year); setSelectedCalendarId(calendar?.id ?? ""); setCreating(false); setEditing(false); }} className={`group relative overflow-hidden rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedStudyYear === year ? "border-primary bg-primary/5 ring-1 ring-primary/15" : "border-border bg-card hover:border-primary/40"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study year</p><div className="mt-2 flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">{year}</span><p className="text-base font-semibold">Year {year} calendar</p></div></div>{calendar ? <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(calendar.status)}`}>{calendar.status}</span> : <span className="rounded-full border border-border bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">Not available</span>}</div><p className="mt-3 text-xs text-muted-foreground">{calendar ? (calendar.studyYears.length > 1 ? `Shared official record · Years ${calendar.studyYears.join("–")}` : `${calendar.periods.length} semester period${calendar.periods.length === 1 ? "" : "s"}`) : `No official ${selectedYear.label} calendar has been issued for Year ${year}.`}</p></button>;
            })}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
            {creating || (editing && selectedCalendar?.status === "Draft") ? (
              <>
                <div className="sticky top-0 z-10 -mx-4 mb-6 flex flex-col gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between md:-mx-6 md:px-6"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{creating ? "Add Academic Calendar" : `Edit Draft · Revision ${selectedCalendar?.revision ?? 1}`}</h3><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">DRAFT · NOT STUDENT-VISIBLE</span></div><p className="mt-1 text-sm text-muted-foreground">Complete the official dates and provenance, then save for review before publishing.</p></div><div className="flex shrink-0 gap-2"><Button variant="outline" onClick={() => { setCreating(false); setEditing(false); if (selectedCalendar) setDraft(fromCalendar(selectedCalendar)); }}>Cancel</Button><Button disabled={saving} onClick={() => void saveDraft()}>{saving ? "Saving…" : "Save Draft"}</Button></div></div>
                <CalendarEditor draft={draft} setDraft={setDraft} />
                {!creating && selectedCalendar?.status === "Draft" ? <div className="mt-6 flex justify-end"><Button disabled={saving} onClick={() => void publish()}><CheckCircle2 className="h-4 w-4" /> Publish official calendar</Button></div> : null}
              </>
            ) : selectedCalendar ? (
              <>
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-lg font-semibold">Year {selectedStudyYear} · {selectedYear.label}</h3><p className="text-sm text-muted-foreground">{selectedCalendar.studyYears.length > 1 ? `This is one shared calendar for Years ${selectedCalendar.studyYears.join(" and ")}.` : "Official programme calendar record."}</p></div><div className="flex flex-wrap gap-2">{selectedCalendar.status === "Draft" ? <><Button variant="outline" onClick={() => { setDraft(fromCalendar(selectedCalendar)); setEditing(true); }}>Edit draft</Button><Button disabled={saving} onClick={() => void publish()}><CheckCircle2 className="h-4 w-4" /> Publish official calendar</Button></> : null}</div></div>
                <CalendarSummary calendar={selectedCalendar} />
                {selectedCalendar.status === "Published" ? <section className="mt-6 rounded-xl border border-border p-4"><h4 className="font-semibold">Correct a published calendar</h4><p className="mt-1 text-sm text-muted-foreground">Published records are never edited in place. Create a correction revision; the existing revision remains the official source until the replacement is published.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input aria-label="Correction reason" value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} placeholder="Reason for correction" /><Button disabled={saving} onClick={() => void createRevision()}><RefreshCw className="h-4 w-4" /> Create correction revision</Button></div></section> : null}
                <section className="mt-6"><div className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /><h4 className="font-semibold">Audit history</h4></div><div className="mt-2 divide-y divide-border rounded-xl border border-border">{auditRows.length ? auditRows.map((row) => <div key={row.id} className="p-3"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-medium">{row.action} · {row.actorName}</p><time className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</time></div>{row.reason ? <p className="mt-1 text-sm text-muted-foreground">{row.reason}</p> : null}</div>) : <p className="p-4 text-sm text-muted-foreground">No audit actions recorded yet.</p>}</div></section>
              </>
            ) : (
              <div className="py-8 text-center"><CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">No academic calendar available yet</h3><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">The official {selectedYear.label} academic calendar for Year {selectedStudyYear} has not yet been issued. No dates will be fabricated.</p><Button className="mt-4" onClick={startCreate}><Plus className="h-4 w-4" /> Add Calendar</Button></div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
