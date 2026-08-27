"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileJson, Upload } from "lucide-react";
import type {
  AcademicCalendarEventInput,
  AcademicCalendarView,
  AcademicYearView,
  UpdateAcademicCalendarDraftInput,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { academicCalendarApi, formatAcademicDate } from "@/lib/academic-calendar";
import {
  ACADEMIC_CALENDAR_JSON_TEMPLATE,
  holidaysToEvents,
  isCurrentCorrectionDraft,
  mergeImportedRevisionEvents,
  normalizeAcademicYearLabel,
  parseAcademicCalendarJson,
  sameSemesterCoverage,
  sameStudyYearCoverage,
  toCreateCalendarInput,
  type AcademicCalendarJsonImport,
} from "./academic-calendar-json-import";

type CalendarPlan = {
  index: number;
  action: "create" | "revision";
  publishedCalendarId: string | null;
  appendProgrammeHolidays: boolean;
};

type ImportPlan = {
  academicYear: AcademicYearView;
  sourceFileName: string;
  input: AcademicCalendarJsonImport;
  calendars: AcademicCalendarView[];
  calendarPlans: CalendarPlan[];
  separateHolidayAnchorId: string | null;
  newHolidayEvents: AcademicCalendarEventInput[];
  skippedHolidayCount: number;
  blockers: string[];
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

function firstCoveredYear(calendar: AcademicCalendarView): number {
  return Math.min(...calendar.studyYears);
}

function holidayKey(event: Pick<AcademicCalendarView["events"][number], "title" | "startDate" | "endDate">): string {
  return `${event.title.trim().toLocaleLowerCase()}|${event.startDate}|${event.endDate ?? ""}`;
}

function viewToUpdate(calendar: AcademicCalendarView): UpdateAcademicCalendarDraftInput {
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

function createPayloadToUpdate(payload: ReturnType<typeof toCreateCalendarInput>): UpdateAcademicCalendarDraftInput {
  return {
    studyYears: payload.studyYears,
    periods: payload.periods,
    events: payload.events,
    sourceTitle: payload.sourceTitle,
    sourcePublishedAt: payload.sourcePublishedAt,
    sourceUrl: payload.sourceUrl,
    sourceFileRef: payload.sourceFileRef,
    sourceNote: payload.sourceNote,
  };
}

function coverageLabel(calendar: AcademicCalendarJsonImport["calendars"][number]): string {
  const years = [...calendar.studyYears].sort((a, b) => a - b).join(", ");
  return `Year${calendar.studyYears.length > 1 ? "s" : ""} ${years}`;
}

function buildPlan(
  academicYear: AcademicYearView,
  sourceFileName: string,
  input: AcademicCalendarJsonImport,
  calendars: AcademicCalendarView[],
): ImportPlan {
  const blockers: string[] = [];
  const calendarPlans: CalendarPlan[] = [];
  const published = calendars.filter((calendar) => calendar.status === "Published");
  const drafts = calendars.filter((calendar) => calendar.status === "Draft");
  const activeDrafts = drafts.filter((draft) =>
    draft.supersedesCalendarId === null
    || published.some((current) => isCurrentCorrectionDraft(draft, current)),
  );

  for (const [index, imported] of input.calendars.entries()) {
    const importedSemesters = imported.periods.map((period) => period.semester);
    const overlappingDrafts = activeDrafts.filter((calendar) =>
      calendar.studyYears.some((year) => imported.studyYears.includes(year))
      && calendar.periods.some((period) => importedSemesters.includes(period.semester)),
    );
    if (overlappingDrafts.length) {
      blockers.push(`${coverageLabel(imported)} already has a draft in progress. Finish, publish, or archive that draft before importing.`);
      continue;
    }

    const overlappingPublished = published.filter((calendar) =>
      calendar.studyYears.some((year) => imported.studyYears.includes(year))
      && calendar.periods.some((period) => importedSemesters.includes(period.semester)),
    );

    if (overlappingPublished.length === 0) {
      calendarPlans.push({ index, action: "create", publishedCalendarId: null, appendProgrammeHolidays: false });
      continue;
    }

    if (overlappingPublished.length > 1) {
      blockers.push(`${coverageLabel(imported)} overlaps more than one published calendar. Import it manually so coverage is not guessed.`);
      continue;
    }

    const existing = overlappingPublished[0]!;
    if (!sameStudyYearCoverage(imported.studyYears, existing.studyYears) || !sameSemesterCoverage(imported.periods, existing.periods)) {
      blockers.push(`${coverageLabel(imported)} does not exactly match the published calendar coverage. JSON import will not narrow or broaden published coverage automatically.`);
      continue;
    }

    calendarPlans.push({ index, action: "revision", publishedCalendarId: existing.id, appendProgrammeHolidays: false });
  }

  const existingHolidayKeys = new Set(
    published.flatMap((calendar) => calendar.events.filter((event) => event.type === "Holiday")).map(holidayKey),
  );
  const newHolidays = input.holidays.filter((holiday) => !existingHolidayKeys.has(holidayKey(holiday)));
  const newHolidayEvents = holidaysToEvents(newHolidays);
  let separateHolidayAnchorId: string | null = null;

  if (newHolidayEvents.length) {
    const anchor = [...published].sort((a, b) => firstCoveredYear(a) - firstCoveredYear(b))[0] ?? null;
    if (!anchor) {
      blockers.push("Programme-wide holidays require at least one published calendar for this academic year. Publish a study-year calendar first.");
    } else {
      const anchorDraft = activeDrafts.find((calendar) => isCurrentCorrectionDraft(calendar, anchor));
      if (anchorDraft) {
        blockers.push(`Year ${firstCoveredYear(anchor)} already has a correction draft in progress, so programme-wide holidays cannot be imported safely.`);
      } else {
        const anchorPlan = calendarPlans.find((item) => item.action === "revision" && item.publishedCalendarId === anchor.id);
        if (anchorPlan) anchorPlan.appendProgrammeHolidays = true;
        else separateHolidayAnchorId = anchor.id;
      }
    }
  }

  return {
    academicYear,
    sourceFileName,
    input,
    calendars,
    calendarPlans,
    separateHolidayAnchorId,
    newHolidayEvents,
    skippedHolidayCount: input.holidays.length - newHolidays.length,
    blockers,
  };
}

export function AcademicCalendarJsonImportClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [programmeId, setProgrammeId] = useState("");
  const [years, setYears] = useState<AcademicYearView[]>([]);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const programme = await academicCalendarApi.programme();
      const academicYears = await academicCalendarApi.years(programme.id);
      setProgrammeId(programme.id);
      setYears(academicYears);
    } catch (reason) {
      setError(errorMessage(reason, "Could not prepare calendar JSON import."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const importSummary = useMemo(() => {
    if (!plan) return null;
    const createCount = plan.calendarPlans.filter((item) => item.action === "create").length;
    const revisionCount = plan.calendarPlans.filter((item) => item.action === "revision").length;
    return { createCount, revisionCount };
  }, [plan]);

  const chooseFile = async (file: File) => {
    setError(null);
    setPlan(null);
    if (!programmeId) {
      setError("Academic Calendar is not ready yet. Reload the page and try again.");
      return;
    }
    if (!file.name.toLocaleLowerCase().endsWith(".json")) {
      setError("Choose a .json file.");
      return;
    }
    if (file.size > 1_000_000) {
      setError("Calendar JSON files must be 1 MB or smaller.");
      return;
    }

    try {
      const parsed = parseAcademicCalendarJson(await file.text());
      if (!parsed.ok) {
        setError(parsed.errors.join("\n"));
        return;
      }
      const normalized = normalizeAcademicYearLabel(parsed.value.academicYear);
      const academicYear = years.find((year) => normalizeAcademicYearLabel(year.label) === normalized) ?? null;
      if (!academicYear) {
        setError(`Academic Year ${parsed.value.academicYear} does not exist in PMS. Create the Academic Year first, then import this file.`);
        return;
      }
      const calendars = await academicCalendarApi.calendars(programmeId, academicYear.id);
      setPlan(buildPlan(academicYear, file.name, parsed.value, calendars));
    } catch (reason) {
      setError(errorMessage(reason, "Could not read the calendar JSON file."));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const executeImport = async () => {
    if (!plan || !programmeId || plan.blockers.length) return;
    setSaving(true);
    setError(null);
    const reason = `JSON import from ${plan.sourceFileName}`;
    try {
      for (const calendarPlan of plan.calendarPlans) {
        const imported = plan.input.calendars[calendarPlan.index]!;
        const extraEvents = calendarPlan.appendProgrammeHolidays ? plan.newHolidayEvents : [];
        const payload = toCreateCalendarInput(plan.academicYear.id, imported, reason, extraEvents);
        if (calendarPlan.action === "create") {
          await academicCalendarApi.create(programmeId, payload);
          continue;
        }
        const revision = await academicCalendarApi.revision(programmeId, calendarPlan.publishedCalendarId!, reason);
        const updatePayload = createPayloadToUpdate(payload);
        updatePayload.events = mergeImportedRevisionEvents(
          imported.events,
          viewToUpdate(revision).events,
          extraEvents,
        );
        await academicCalendarApi.update(programmeId, revision.id, updatePayload);
      }

      if (plan.separateHolidayAnchorId && plan.newHolidayEvents.length) {
        const anchor = plan.calendars.find((calendar) => calendar.id === plan.separateHolidayAnchorId);
        if (!anchor) throw new Error("Programme-wide holiday anchor is no longer available.");
        const revision = await academicCalendarApi.revision(
          programmeId,
          anchor.id,
          `JSON import programme-wide holidays from ${plan.sourceFileName}`,
        );
        const payload = viewToUpdate(revision);
        const existingKeys = new Set(payload.events.filter((event) => event.type === "Holiday").map(holidayKey));
        const additions = plan.newHolidayEvents.filter((event) => !existingKeys.has(holidayKey(event)));
        payload.events.push(...additions.map((event, index) => ({ ...event, sortOrder: payload.events.length + index })));
        await academicCalendarApi.update(programmeId, revision.id, payload);
      }

      window.location.reload();
    } catch (reason) {
      setError(`${errorMessage(reason, "Calendar JSON import failed.")} Published calendars were not changed. Any draft created before the failure remains a draft and should be reviewed before retrying.`);
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([`${JSON.stringify(ACADEMIC_CALENDAR_JSON_TEMPLATE, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "academic-calendar-import-template.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mx-auto max-w-7xl rounded-2xl border border-border bg-card p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Import calendar JSON</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Upload a structured Academic Calendar file, review the changes first, then create drafts. Published calendars are never edited in place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={loading} onClick={downloadTemplate}>
            <Download className="h-4 w-4" /> JSON template
          </Button>
          <Button type="button" variant="outline" disabled={loading || !programmeId || saving} onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Upload JSON
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Upload Academic Calendar JSON"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void chooseFile(file); }}
          />
        </div>
      </div>

      {error ? <div role="alert" className="mt-4 whitespace-pre-line rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      {plan ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold">Preview · {plan.academicYear.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{plan.sourceFileName}</p>
            </div>
            {plan.blockers.length ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Blocked</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Ready as draft</span>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">New drafts</p><p className="mt-1 text-xl font-semibold">{importSummary?.createCount ?? 0}</p></div>
            <div className="rounded-lg border border-border bg-background p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Correction drafts</p><p className="mt-1 text-xl font-semibold">{importSummary?.revisionCount ?? 0}</p></div>
            <div className="rounded-lg border border-border bg-background p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">New holidays</p><p className="mt-1 text-xl font-semibold">{plan.newHolidayEvents.length}</p>{plan.skippedHolidayCount ? <p className="mt-1 text-xs text-muted-foreground">{plan.skippedHolidayCount} already published · skipped</p> : null}</div>
          </div>

          {plan.input.calendars.length ? (
            <div className="mt-4 space-y-2">
              {plan.input.calendars.map((calendar, index) => {
                const calendarPlan = plan.calendarPlans.find((item) => item.index === index);
                return (
                  <div key={`${coverageLabel(calendar)}-${index}`} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-medium">{coverageLabel(calendar)}</p>
                      <p className="text-xs font-medium text-muted-foreground">{calendarPlan?.action === "revision" ? "Published → correction draft" : calendarPlan?.action === "create" ? "Create new draft" : "Needs attention"}</p>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {calendar.periods.map((period) => (
                        <div key={period.semester} className="text-sm">
                          <span className="font-medium">{period.semester === "First" ? "Semester 1" : "Semester 2"}</span>
                          <span className="ml-2 text-muted-foreground">Teaching {formatAcademicDate(period.teachingStart)} – {formatAcademicDate(period.teachingEnd)}</span>
                          {period.examStart && period.examEnd ? <span className="block text-muted-foreground">Final Exam Week {formatAcademicDate(period.examStart)} – {formatAcademicDate(period.examEnd)}</span> : null}
                          {period.breakStart && period.breakEnd ? <span className="block text-muted-foreground">Break {formatAcademicDate(period.breakStart)} – {formatAcademicDate(period.breakEnd)}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {plan.blockers.length ? (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <p className="font-medium text-destructive">Resolve before importing</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">{plan.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              Import creates only Draft or correction-Draft records. It does not publish them. Review each draft in Academic Calendar before publishing it as official.
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setPlan(null)}>Cancel</Button>
            <Button type="button" disabled={saving || plan.blockers.length > 0} onClick={() => void executeImport()}>{saving ? "Importing…" : "Import as drafts"}</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}