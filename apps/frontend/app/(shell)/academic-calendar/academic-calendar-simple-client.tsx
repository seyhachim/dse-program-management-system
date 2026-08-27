"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Copy, FileText, History, Plus, RefreshCw, Trash2 } from "lucide-react";
import type {
  AcademicCalendarAuditView,
  AcademicCalendarEventInput,
  AcademicCalendarEventType,
  AcademicCalendarPeriodInput,
  AcademicCalendarView,
  AcademicYearView,
} from "@dse-pms/shared-types";
import { ACADEMIC_CALENDAR_EVENT_TYPES } from "@dse-pms/shared-types";
import { Button, Input, Label } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { academicCalendarApi, academicSemesterLabel, formatAcademicDate } from "@/lib/academic-calendar";

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

type AcademicYearDraft = { startYear: string; setCurrent: boolean };

type CoveragePreset = "1" | "2" | "3" | "4" | "3-4" | "all" | "custom";

function message(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}

function RequiredMark({ publishing = false }: { publishing?: boolean }) {
  return (
    <span className="ml-1 font-normal text-destructive">
      {publishing ? "* required to publish" : "* required"}
    </span>
  );
}

function suggestedAcademicYearDraft(years: AcademicYearView[] = []): AcademicYearDraft {
  const currentYear = new Date().getFullYear();
  const latestEndYear = years.reduce((latest, year) => Math.max(latest, year.endYear), currentYear);
  return { startYear: String(latestEndYear), setCurrent: years.length === 0 };
}

function academicYearValues(startYearText: string): { startYear: number; endYear: number; label: string } | null {
  const startYear = Number(startYearText);
  if (!Number.isInteger(startYear) || startYear < 1900 || startYear > 2200) return null;
  const endYear = startYear + 1;
  return { startYear, endYear, label: `${startYear}–${endYear}` };
}

function emptyPeriod(semester: "First" | "Second"): PeriodDraft {
  return {
    semester,
    enabled: true,
    teachingStart: "",
    teachingEnd: "",
    examStart: "",
    examEnd: "",
    breakStart: "",
    breakEnd: "",
  };
}

function emptyEvent(index: number): EventDraft {
  return {
    key: `event-${Date.now()}-${index}`,
    title: "",
    type: "Other",
    semester: "Second",
    startDate: "",
    endDate: "",
    note: "",
  };
}

function emptyDraft(studyYear = 1): CalendarDraft {
  return {
    studyYears: [studyYear],
    periods: [emptyPeriod("First"), emptyPeriod("Second")],
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
        : { ...emptyPeriod(semester), enabled: false };
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

function enabledPeriods(draft: CalendarDraft): AcademicCalendarPeriodInput[] {
  return draft.periods.filter((period) => period.enabled).map((period) => ({
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

function coveragePreset(studyYears: number[]): CoveragePreset {
  const value = [...studyYears].sort((a, b) => a - b).join(",");
  if (value === "1" || value === "2" || value === "3" || value === "4") return value;
  if (value === "3,4") return "3-4";
  if (value === "1,2,3,4") return "all";
  return "custom";
}

function presetYears(preset: CoveragePreset): number[] | null {
  if (preset === "1" || preset === "2" || preset === "3" || preset === "4") return [Number(preset)];
  if (preset === "3-4") return [3, 4];
  if (preset === "all") return [1, 2, 3, 4];
  return null;
}

function isoToDmy(value: string): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function dmyToIso(value: string): string | null {
  const trimmed = value.trim();
  const match = /^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{4})$/.exec(trimmed);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function CalendarDateField({ id, label, value, onChange, required = false }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      <Input
        id={id}
        type="date"
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function DateField({ id, label, value, onChange, disabled = false, optional = false, required = false }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  optional?: boolean;
  required?: boolean;
}) {
  const [text, setText] = useState(() => isoToDmy(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => setText(isoToDmy(value)), [value]);

  const commit = () => {
    if (!text.trim()) {
      setInvalid(false);
      onChange("");
      return;
    }
    const iso = dmyToIso(text);
    if (!iso) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(isoToDmy(iso));
    onChange(iso);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <RequiredMark /> : optional ? <span className="ml-1 font-normal text-muted-foreground">(optional)</span> : null}
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        required={required}
        value={text}
        placeholder="DD/MM/YYYY"
        aria-invalid={invalid || undefined}
        onChange={(event) => { setText(event.target.value); setInvalid(false); }}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }}
      />
      {invalid ? <p className="text-xs text-destructive">Use DD/MM/YYYY, for example 25/08/2026.</p> : null}
    </div>
  );
}

function statusClasses(status: AcademicCalendarView["status"]): string {
  if (status === "Published") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "Draft") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted text-muted-foreground";
}

function CalendarEditor({ draft, setDraft }: { draft: CalendarDraft; setDraft: (next: CalendarDraft) => void }) {
  const [showOptional, setShowOptional] = useState<Record<string, boolean>>(() => ({
    First: Boolean(draft.periods[0]?.examStart || draft.periods[0]?.breakStart),
    Second: Boolean(draft.periods[1]?.examStart || draft.periods[1]?.breakStart),
  }));
  const preset = coveragePreset(draft.studyYears);

  const updatePeriod = (semester: "First" | "Second", patch: Partial<PeriodDraft>) => {
    setDraft({ ...draft, periods: draft.periods.map((period) => period.semester === semester ? { ...period, ...patch } : period) });
  };

  const updateEvent = (key: string, patch: Partial<EventDraft>) => {
    setDraft({ ...draft, events: draft.events.map((event) => event.key === key ? { ...event, ...patch } : event) });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-muted/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label htmlFor="calendar-coverage">Applies to<RequiredMark /></Label>
            <select
              id="calendar-coverage"
              required
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={preset}
              onChange={(event) => {
                const next = presetYears(event.target.value as CoveragePreset);
                if (next) setDraft({ ...draft, studyYears: next });
              }}
            >
              <option value="1">Year 1</option>
              <option value="2">Year 2</option>
              <option value="3">Year 3</option>
              <option value="4">Year 4</option>
              <option value="3-4">Years 3–4</option>
              <option value="all">All years</option>
              <option value="custom">Custom…</option>
            </select>
          </div>
          <p className="text-sm text-muted-foreground sm:max-w-md">Choose the normal coverage in one step. Use Custom only for an unusual combination.</p>
        </div>
        {preset === "custom" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {STUDY_YEARS.map((year) => (
              <label key={year} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.studyYears.includes(year)}
                  onChange={(event) => setDraft({
                    ...draft,
                    studyYears: event.target.checked
                      ? [...draft.studyYears, year].sort((a, b) => a - b)
                      : draft.studyYears.filter((item) => item !== year),
                  })}
                />
                Year {year}
              </label>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <div className="mb-3">
          <h4 className="font-semibold">Semester dates</h4>
          <p className="mt-1 text-sm text-muted-foreground">Choose teaching dates from the calendar. Exam and break dates stay hidden until needed.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {draft.periods.map((period) => (
            <section key={period.semester} className="rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h5 className="font-semibold">{academicSemesterLabel(period.semester)}</h5>
                  {!period.enabled ? <p className="mt-1 text-xs text-muted-foreground">Dates not issued / not used for this academic year.</p> : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => updatePeriod(period.semester, { enabled: !period.enabled })}
                >
                  {period.enabled ? "Dates not issued" : "Add semester dates"}
                </Button>
              </div>
              {period.enabled ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CalendarDateField required id={`${period.semester}-teaching-start`} label="Teaching start" value={period.teachingStart} onChange={(value) => updatePeriod(period.semester, { teachingStart: value })} />
                    <CalendarDateField required id={`${period.semester}-teaching-end`} label="Teaching end" value={period.teachingEnd} onChange={(value) => updatePeriod(period.semester, { teachingEnd: value })} />
                  </div>
                  <Button type="button" variant="outline" onClick={() => setShowOptional((current) => ({ ...current, [period.semester]: !current[period.semester] }))}>
                    {showOptional[period.semester] ? "Hide optional dates" : "+ Add exam / break dates"}
                  </Button>
                  {showOptional[period.semester] ? (
                    <div className="grid gap-3 rounded-xl bg-muted/30 p-3 sm:grid-cols-2">
                      <DateField id={`${period.semester}-exam-start`} label="Exam start" optional value={period.examStart} onChange={(value) => updatePeriod(period.semester, { examStart: value })} />
                      <DateField id={`${period.semester}-exam-end`} label="Exam end" optional value={period.examEnd} onChange={(value) => updatePeriod(period.semester, { examEnd: value })} />
                      <DateField id={`${period.semester}-break-start`} label="Break start" optional value={period.breakStart} onChange={(value) => updatePeriod(period.semester, { breakStart: value })} />
                      <DateField id={`${period.semester}-break-end`} label="Break end" optional value={period.breakEnd} onChange={(value) => updatePeriod(period.semester, { breakEnd: value })} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-muted/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="font-semibold">Academic events</h4>
            <p className="mt-1 text-sm text-muted-foreground">Add special academic periods such as defense week, orientation, or presentations. Set the semester so the event appears inside the matching public semester card.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setDraft({ ...draft, events: [...draft.events, emptyEvent(draft.events.length)] })}>
            <Plus className="h-4 w-4" /> Add event
          </Button>
        </div>

        {draft.events.length ? (
          <div className="mt-4 space-y-4">
            {draft.events.map((event, index) => (
              <section key={event.key} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h5 className="font-medium">Event {index + 1}{event.title ? ` · ${event.title}` : ""}</h5>
                    <p className="mt-1 text-xs text-muted-foreground">Use Programme-wide only for a non-semester event. Official holidays should continue to use the Programme-wide holidays panel.</p>
                  </div>
                  <Button type="button" variant="ghost" aria-label={`Remove event ${index + 1}`} onClick={() => setDraft({ ...draft, events: draft.events.filter((item) => item.key !== event.key) })}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor={`event-title-${event.key}`}>Title<RequiredMark /></Label>
                    <Input id={`event-title-${event.key}`} required value={event.title} onChange={(e) => updateEvent(event.key, { title: e.target.value })} placeholder="Defense week" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`event-type-${event.key}`}>Type<RequiredMark /></Label>
                    <select id={`event-type-${event.key}`} required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={event.type} onChange={(e) => updateEvent(event.key, { type: e.target.value as AcademicCalendarEventType })}>
                      {ACADEMIC_CALENDAR_EVENT_TYPES.filter((type) => type !== "Holiday").map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`event-semester-${event.key}`}>Semester</Label>
                    <select id={`event-semester-${event.key}`} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={event.semester} onChange={(e) => updateEvent(event.key, { semester: e.target.value as EventDraft["semester"] })}>
                      <option value="">Programme-wide / no semester</option>
                      <option value="First">Semester 1</option>
                      <option value="Second">Semester 2</option>
                    </select>
                  </div>
                  <CalendarDateField required id={`event-start-${event.key}`} label="Start date" value={event.startDate} onChange={(value) => updateEvent(event.key, { startDate: value })} />
                  <CalendarDateField id={`event-end-${event.key}`} label="End date" value={event.endDate} onChange={(value) => updateEvent(event.key, { endDate: value })} />
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor={`event-note-${event.key}`}>Note <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <textarea id={`event-note-${event.key}`} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={event.note} onChange={(e) => updateEvent(event.key, { note: e.target.value })} placeholder="Final project / thesis defense and presentation for graduating students." />
                  </div>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">No academic events added. Add an event only when the official calendar issues a special academic period.</p>
        )}
      </section>

      <section className="rounded-2xl border border-primary/20 bg-primary/[0.025] p-4">
        <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h4 className="font-semibold">Official source</h4></div>
        <p className="mt-1 text-sm text-muted-foreground">You can save a draft without this. Add provenance before publishing the official calendar.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="source-title">Source title<RequiredMark publishing /></Label><Input id="source-title" value={draft.sourceTitle} onChange={(e) => setDraft({ ...draft, sourceTitle: e.target.value })} placeholder="RUPP Academic Calendar 2026–2027" /></div>
          <DateField id="source-date" label="Issue / published date" optional value={draft.sourcePublishedAt} onChange={(value) => setDraft({ ...draft, sourcePublishedAt: value })} />
          <div className="space-y-1.5"><Label htmlFor="source-url">Source URL</Label><Input id="source-url" type="url" value={draft.sourceUrl} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} placeholder="https://…" /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="source-file">Managed file reference (optional)</Label><Input id="source-file" value={draft.sourceFileRef} onChange={(e) => setDraft({ ...draft, sourceFileRef: e.target.value })} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="source-note">Source note</Label><textarea id="source-note" className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={draft.sourceNote} onChange={(e) => setDraft({ ...draft, sourceNote: e.target.value })} placeholder="Record where the official dates came from and any interpretation needed." /></div>
        </div>
      </section>
    </div>
  );
}

function CalendarSummary({ calendar }: { calendar: AcademicCalendarView }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(calendar.status)}`}>{calendar.status}</span>
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
    </div>
  );
}

export function AcademicCalendarSimpleClient() {
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
  const [auditRows, setAuditRows] = useState<AcademicCalendarAuditView[]>([]);
  const [newYear, setNewYear] = useState<AcademicYearDraft>(() => suggestedAcademicYearDraft());
  const [showNewYear, setShowNewYear] = useState(false);

  const selectedYear = years.find((year) => year.id === selectedYearId) ?? null;
  const newYearValues = academicYearValues(newYear.startYear);
  const calendarForStudyYear = useMemo(() => {
    const candidates = calendars.filter((calendar) => calendar.studyYears.includes(selectedStudyYear));
    return candidates.find((calendar) => calendar.status === "Published") ?? candidates.find((calendar) => calendar.status === "Draft") ?? candidates[0] ?? null;
  }, [calendars, selectedStudyYear]);
  const selectedCalendar = calendars.find((calendar) => calendar.id === selectedCalendarId) ?? calendarForStudyYear;

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
      if (preferred) await loadCalendars(programme.id, preferred.id); else setCalendars([]);
    } catch (reason) { setError(message(reason, "Could not load Academic Calendar.")); }
    finally { setLoading(false); }
  }, [loadCalendars]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selectedCalendar) { setSelectedCalendarId(""); setAuditRows([]); return; }
    let cancelled = false;
    setSelectedCalendarId(selectedCalendar.id);
    if (!editing && !creating) setDraft(fromCalendar(selectedCalendar));
    void academicCalendarApi.audit(programmeId, selectedCalendar.id)
      .then((rows) => { if (!cancelled) setAuditRows(rows); })
      .catch(() => { if (!cancelled) setAuditRows([]); });
    return () => { cancelled = true; };
  }, [selectedCalendar?.id, selectedCalendar?.status, programmeId, editing, creating]);

  const changeAcademicYear = async (academicYearId: string) => {
    setSelectedYearId(academicYearId); setSelectedCalendarId(""); setCreating(false); setEditing(false); setError(null); setNotice(null);
    if (!programmeId || !academicYearId) { setCalendars([]); return; }
    try { await loadCalendars(programmeId, academicYearId); }
    catch (reason) { setError(message(reason, "Could not load calendars for this academic year.")); }
  };

  const createAcademicYear = async () => {
    if (!programmeId) return;
    const values = academicYearValues(newYear.startYear);
    if (!values) { setError("Enter a valid four-digit start year, for example 2027."); return; }
    if (years.some((year) => year.startYear === values.startYear && year.endYear === values.endYear)) {
      setError(`Academic year ${values.label} already exists.`);
      return;
    }
    setSaving(true); setError(null);
    try {
      const created = await academicCalendarApi.createYear(programmeId, { ...values, isCurrent: newYear.setCurrent });
      const nextYears = await academicCalendarApi.years(programmeId);
      setYears(nextYears); setSelectedYearId(created.id); setCalendars([]); setShowNewYear(false); setNewYear(suggestedAcademicYearDraft(nextYears)); setNotice(`Academic year ${values.label} created.`);
    } catch (reason) { setError(message(reason, "Could not create academic year.")); }
    finally { setSaving(false); }
  };

  const startCreate = () => {
    setCreating(true); setEditing(true); setSelectedCalendarId(""); setDraft(emptyDraft(selectedStudyYear)); setError(null); setNotice(null);
  };

  const copyPreviousYear = async () => {
    if (!programmeId || !selectedYear) return;
    const previous = years.filter((year) => year.startYear < selectedYear.startYear).sort((a, b) => b.startYear - a.startYear)[0];
    if (!previous) { setError("No previous academic year is available to copy."); return; }
    setSaving(true); setError(null);
    try {
      const previousCalendars = await academicCalendarApi.calendars(programmeId, previous.id);
      const source = previousCalendars.find((calendar) => calendar.status === "Published" && calendar.studyYears.includes(selectedStudyYear))
        ?? previousCalendars.find((calendar) => calendar.studyYears.includes(selectedStudyYear));
      if (!source) { setError(`No Year ${selectedStudyYear} calendar exists in ${previous.label}.`); return; }
      const copied = fromCalendar(source);
      copied.sourceTitle = ""; copied.sourcePublishedAt = ""; copied.sourceUrl = ""; copied.sourceFileRef = ""; copied.sourceNote = `Structure copied from ${previous.label}; verify all dates against the new official source before publishing.`;
      setDraft(copied); setCreating(true); setEditing(true); setSelectedCalendarId(""); setNotice(`Copied the ${previous.label} structure. Update the dates before saving.`);
    } catch (reason) { setError(message(reason, "Could not copy the previous academic year.")); }
    finally { setSaving(false); }
  };

  const saveDraft = async () => {
    if (!programmeId || !selectedYearId) return;
    if (draft.studyYears.length === 0) { setError("Select at least one study year."); return; }
    const periods = enabledPeriods(draft);
    if (!periods.length || periods.some((period) => !period.teachingStart || !period.teachingEnd)) { setError("Enter teaching start and end dates for each semester that has dates."); return; }
    if (draft.events.some((event) => !event.title.trim() || !event.startDate)) { setError("Each academic event needs a title and start date."); return; }
    if (draft.events.some((event) => event.endDate && event.endDate < event.startDate)) { setError("An academic event end date cannot be before its start date."); return; }
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
      setSelectedCalendarId(revision.id); setDraft(fromCalendar(revision)); setEditing(true); setCreating(false); setRevisionReason(""); setNotice("Correction revision created. The published calendar remains unchanged until this draft is published.");
    } catch (reason) { setError(message(reason, "Could not create a correction revision.")); }
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
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Enter official semester dates once. Draft safely, then publish an immutable revision for Offerings and students.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-56 space-y-1.5"><Label htmlFor="academic-year">Academic Year</Label><select id="academic-year" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedYearId} onChange={(e) => void changeAcademicYear(e.target.value)}><option value="">Select year</option>{years.map((year) => <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? " · Current" : ""}</option>)}</select></div>
            <Button variant="outline" onClick={() => { const opening = !showNewYear; setShowNewYear(opening); if (opening) { setNewYear(suggestedAcademicYearDraft(years)); setError(null); } }}><Plus className="h-4 w-4" /> Academic Year</Button>
            {selectedYear && !selectedYear.isCurrent ? <Button variant="outline" onClick={() => void academicCalendarApi.setCurrentYear(programmeId, selectedYear.id).then(load)}><RefreshCw className="h-4 w-4" /> Set current</Button> : null}
          </div>
        </div>
        {showNewYear ? (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl flex-1">
                <h3 className="font-semibold">Add Academic Year</h3>
                <p className="mt-1 text-sm text-muted-foreground">Enter only the first year. PMS automatically creates the next year and academic-year label.</p>
                <div className="mt-4 max-w-xs space-y-1.5">
                  <Label htmlFor="new-year-start">Start year<RequiredMark /></Label>
                  <Input required id="new-year-start" inputMode="numeric" autoComplete="off" value={newYear.startYear} onChange={(e) => setNewYear({ ...newYear, startYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="2027" />
                </div>
                <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">Academic Year</span>
                  <span className="ml-2 font-semibold">{newYearValues?.label ?? "—"}</span>
                  {newYearValues ? <span className="ml-2 text-muted-foreground">({newYearValues.startYear} → {newYearValues.endYear})</span> : null}
                </div>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={newYear.setCurrent} onChange={(e) => setNewYear({ ...newYear, setCurrent: e.target.checked })} />
                  <span><span className="font-medium">Set as current academic year</span><span className="block text-xs text-muted-foreground">Use this only when this is the active academic year for the programme.</span></span>
                </label>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" onClick={() => { setShowNewYear(false); setError(null); }}>Cancel</Button>
                <Button disabled={saving || !newYearValues} onClick={() => void createAcademicYear()}>{saving ? "Creating…" : `Create ${newYearValues?.label ?? "Academic Year"}`}</Button>
              </div>
            </div>
          </div>
        ) : null}
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
              return <button key={year} type="button" onClick={() => { setSelectedStudyYear(year); setSelectedCalendarId(calendar?.id ?? ""); setCreating(false); setEditing(false); setError(null); setNotice(null); }} className={`rounded-2xl border p-4 text-left shadow-sm transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedStudyYear === year ? "border-primary bg-primary/5" : "border-border bg-card"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study year</p><p className="mt-2 text-lg font-semibold">Year {year}</p></div>{calendar ? <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(calendar.status)}`}>{calendar.status}</span> : <span className="rounded-full border border-border bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">Not available</span>}</div><p className="mt-3 text-xs text-muted-foreground">{calendar ? (calendar.studyYears.length > 1 ? `Shared record · Years ${calendar.studyYears.join("–")}` : `${calendar.periods.length} semester period${calendar.periods.length === 1 ? "" : "s"}`) : `No ${selectedYear.label} calendar issued for Year ${year}.`}</p></button>;
            })}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
            {creating || (editing && selectedCalendar?.status === "Draft") ? (
              <>
                <div className="sticky top-0 z-10 -mx-4 mb-6 flex flex-col gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between md:-mx-6 md:px-6">
                  <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{creating ? "Add Academic Calendar" : `Edit Draft · Revision ${selectedCalendar?.revision ?? 1}`}</h3><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">DRAFT · NOT STUDENT-VISIBLE</span></div><p className="mt-1 text-sm text-muted-foreground">Fields marked <span className="text-destructive">* required</span> must be filled before saving. Source title is required only when publishing.</p></div>
                  <div className="flex shrink-0 gap-2"><Button variant="outline" onClick={() => { setCreating(false); setEditing(false); if (selectedCalendar) setDraft(fromCalendar(selectedCalendar)); }}>Cancel</Button><Button disabled={saving} onClick={() => void saveDraft()}>{saving ? "Saving…" : "Save Draft"}</Button></div>
                </div>
                <CalendarEditor draft={draft} setDraft={setDraft} />
                {!creating && selectedCalendar?.status === "Draft" ? <div className="mt-6 flex justify-end"><Button disabled={saving} onClick={() => void publish()}><CheckCircle2 className="h-4 w-4" /> Publish official calendar</Button></div> : null}
              </>
            ) : selectedCalendar ? (
              <>
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-lg font-semibold">Year {selectedStudyYear} · {selectedYear.label}</h3><p className="text-sm text-muted-foreground">{selectedCalendar.studyYears.length > 1 ? `Shared calendar for Years ${selectedCalendar.studyYears.join(" and ")}.` : "Official programme calendar record."}</p></div><div className="flex flex-wrap gap-2">{selectedCalendar.status === "Draft" ? <><Button variant="outline" onClick={() => { setDraft(fromCalendar(selectedCalendar)); setEditing(true); setError(null); }}>Edit draft</Button><Button disabled={saving} onClick={() => void publish()}><CheckCircle2 className="h-4 w-4" /> Publish official calendar</Button></> : null}</div></div>
                <CalendarSummary calendar={selectedCalendar} />
                {selectedCalendar.status === "Published" ? <section className="mt-6 rounded-xl border border-border p-4"><h4 className="font-semibold">Correct a published calendar</h4><p className="mt-1 text-sm text-muted-foreground">Published records are never edited in place. Create a correction revision to preserve history.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input aria-label="Correction reason" value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} placeholder="Reason for correction" /><Button disabled={saving} onClick={() => void createRevision()}><RefreshCw className="h-4 w-4" /> Create correction revision</Button></div></section> : null}
                <section className="mt-6"><div className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /><h4 className="font-semibold">Audit history</h4></div><div className="mt-2 divide-y divide-border rounded-xl border border-border">{auditRows.length ? auditRows.map((row) => <div key={row.id} className="p-3"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-medium">{row.action} · {row.actorName}</p><time className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</time></div>{row.reason ? <p className="mt-1 text-sm text-muted-foreground">{row.reason}</p> : null}</div>) : <p className="p-4 text-sm text-muted-foreground">No audit actions recorded yet.</p>}</div></section>
              </>
            ) : (
              <div className="py-8 text-center"><CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">No academic calendar available yet</h3><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">The official {selectedYear.label} academic calendar for Year {selectedStudyYear} has not yet been issued. No dates will be fabricated.</p><div className="mt-4 flex flex-wrap justify-center gap-2"><Button onClick={startCreate}><Plus className="h-4 w-4" /> Add Calendar</Button><Button variant="outline" disabled={saving} onClick={() => void copyPreviousYear()}><Copy className="h-4 w-4" /> Copy previous year</Button></div></div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
