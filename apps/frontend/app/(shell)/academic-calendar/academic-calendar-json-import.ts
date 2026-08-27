import { z } from "zod";
import {
  AcademicCalendarEventInputSchema,
  AcademicCalendarPeriodInputSchema,
  AcademicCalendarStudyYearSchema,
  type AcademicCalendarEventInput,
  type AcademicCalendarPeriodInput,
  type AcademicCalendarView,
  type CreateAcademicCalendarInput,
} from "@dse-pms/shared-types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ImportSourceSchema = z.object({
  title: z.string().trim().max(300).default(""),
  publishedAt: z.string().regex(ISO_DATE, "Use YYYY-MM-DD").nullable().optional(),
  url: z.string().trim().url().nullable().optional().or(z.literal("")),
  fileRef: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().max(3000).default(""),
}).default({ title: "", note: "" });

const ImportCalendarSchema = z.object({
  studyYears: z.array(AcademicCalendarStudyYearSchema).min(1).max(4),
  periods: z.array(AcademicCalendarPeriodInputSchema).min(1).max(2),
  events: z.array(AcademicCalendarEventInputSchema).max(100).default([]),
  source: ImportSourceSchema,
}).superRefine((calendar, ctx) => {
  if (new Set(calendar.studyYears).size !== calendar.studyYears.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["studyYears"], message: "Study years must be unique" });
  }
  const semesters = calendar.periods.map((period) => period.semester);
  if (new Set(semesters).size !== semesters.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periods"], message: "Each semester may appear once per calendar" });
  }
});

const ImportHolidaySchema = z.object({
  title: z.string().trim().min(1).max(200),
  startDate: z.string().regex(ISO_DATE, "Use YYYY-MM-DD"),
  endDate: z.string().regex(ISO_DATE, "Use YYYY-MM-DD").nullable().optional(),
  note: z.string().trim().max(2000).default(""),
}).superRefine((holiday, ctx) => {
  const dates = [holiday.startDate, holiday.endDate].filter(Boolean) as string[];
  for (const value of dates) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [value === holiday.startDate ? "startDate" : "endDate"], message: "Use a valid calendar date" });
    }
  }
  if (holiday.endDate && holiday.endDate < holiday.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "Holiday end cannot precede start" });
  }
});

export const AcademicCalendarJsonImportSchema = z.object({
  academicYear: z.string().trim().min(4).max(40),
  calendars: z.array(ImportCalendarSchema).max(4).default([]),
  holidays: z.array(ImportHolidaySchema).max(100).default([]),
}).superRefine((input, ctx) => {
  if (input.calendars.length === 0 && input.holidays.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: "Import at least one calendar or holiday" });
  }

  const seenCoverage = new Set<string>();
  for (const [calendarIndex, calendar] of input.calendars.entries()) {
    for (const studyYear of calendar.studyYears) {
      for (const period of calendar.periods) {
        const key = `${studyYear}:${period.semester}`;
        if (seenCoverage.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["calendars", calendarIndex, "periods"],
            message: `Year ${studyYear} ${period.semester === "First" ? "Semester 1" : "Semester 2"} is covered more than once in this import`,
          });
        }
        seenCoverage.add(key);
      }
    }
  }

  const holidayKeys = new Set<string>();
  for (const [index, holiday] of input.holidays.entries()) {
    const key = `${holiday.title.toLocaleLowerCase()}|${holiday.startDate}|${holiday.endDate ?? ""}`;
    if (holidayKeys.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["holidays", index], message: "Duplicate holiday in import" });
    }
    holidayKeys.add(key);
  }
});

export type AcademicCalendarJsonImport = z.infer<typeof AcademicCalendarJsonImportSchema>;
export type AcademicCalendarJsonImportCalendar = AcademicCalendarJsonImport["calendars"][number];
export type AcademicCalendarJsonImportHoliday = AcademicCalendarJsonImport["holidays"][number];

export type AcademicCalendarJsonValidation =
  | { ok: true; value: AcademicCalendarJsonImport }
  | { ok: false; errors: string[] };

export function parseAcademicCalendarJson(text: string): AcademicCalendarJsonValidation {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The selected file is not valid JSON."] };
  }

  const result = AcademicCalendarJsonImportSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`),
    };
  }
  return { ok: true, value: result.data };
}

export function normalizeAcademicYearLabel(value: string): string {
  return value.trim().replace(/[–—]/g, "-").replace(/\s+/g, "");
}

export function sameStudyYearCoverage(left: readonly number[], right: readonly number[]): boolean {
  return [...left].sort((a, b) => a - b).join(",") === [...right].sort((a, b) => a - b).join(",");
}

export function sameSemesterCoverage(left: readonly AcademicCalendarPeriodInput[], right: readonly { semester: "First" | "Second" }[]): boolean {
  return [...left].map((item) => item.semester).sort().join(",") === [...right].map((item) => item.semester).sort().join(",");
}

export function isCurrentCorrectionDraft(
  draft: Pick<AcademicCalendarView, "status" | "seriesKey" | "supersedesCalendarId">,
  published: Pick<AcademicCalendarView, "id" | "status" | "seriesKey">,
): boolean {
  return draft.status === "Draft"
    && published.status === "Published"
    && draft.seriesKey === published.seriesKey
    && draft.supersedesCalendarId === published.id;
}

export function canReuseCorrectionDraftForHolidayOnly(
  importedCalendarCount: number,
  draft: Pick<AcademicCalendarView, "status" | "seriesKey" | "supersedesCalendarId">,
  published: Pick<AcademicCalendarView, "id" | "status" | "seriesKey">,
): boolean {
  return importedCalendarCount === 0 && isCurrentCorrectionDraft(draft, published);
}

function holidayEventKey(event: Pick<AcademicCalendarEventInput, "title" | "startDate" | "endDate">): string {
  return `${event.title.trim().toLocaleLowerCase()}|${event.startDate}|${event.endDate ?? ""}`;
}

/**
 * A JSON correction replaces calendar-scoped events, but published Holiday events are
 * programme-wide official closures and must survive when the correction file omits them.
 * Additional imported holidays are appended without creating semantic duplicates.
 */
export function mergeImportedRevisionEvents(
  importedEvents: readonly AcademicCalendarEventInput[],
  publishedEvents: readonly AcademicCalendarEventInput[],
  additionalEvents: readonly AcademicCalendarEventInput[] = [],
): AcademicCalendarEventInput[] {
  const merged = importedEvents.map((event) => ({ ...event }));
  const seenHolidayKeys = new Set(
    merged.filter((event) => event.type === "Holiday").map(holidayEventKey),
  );

  for (const event of publishedEvents) {
    if (event.type !== "Holiday") continue;
    const key = holidayEventKey(event);
    if (seenHolidayKeys.has(key)) continue;
    merged.push({ ...event });
    seenHolidayKeys.add(key);
  }

  for (const event of additionalEvents) {
    if (event.type === "Holiday") {
      const key = holidayEventKey(event);
      if (seenHolidayKeys.has(key)) continue;
      seenHolidayKeys.add(key);
    }
    merged.push({ ...event });
  }

  return merged.map((event, index) => ({ ...event, sortOrder: index }));
}

export function toCreateCalendarInput(
  academicYearId: string,
  calendar: AcademicCalendarJsonImportCalendar,
  revisionReason: string,
  extraEvents: AcademicCalendarEventInput[] = [],
): CreateAcademicCalendarInput {
  return {
    academicYearId,
    revisionReason,
    studyYears: [...calendar.studyYears],
    periods: calendar.periods.map((period) => ({ ...period })),
    events: [...calendar.events.map((event) => ({ ...event })), ...extraEvents],
    sourceTitle: calendar.source.title,
    sourcePublishedAt: calendar.source.publishedAt ?? null,
    sourceUrl: calendar.source.url || null,
    sourceFileRef: calendar.source.fileRef ?? null,
    sourceNote: calendar.source.note,
  };
}

export function holidaysToEvents(holidays: readonly AcademicCalendarJsonImportHoliday[], startSortOrder = 0): AcademicCalendarEventInput[] {
  return holidays.map((holiday, index) => ({
    title: holiday.title,
    type: "Holiday",
    semester: null,
    startDate: holiday.startDate,
    endDate: holiday.endDate ?? null,
    note: holiday.note,
    sortOrder: startSortOrder + index,
  }));
}

export const ACADEMIC_CALENDAR_JSON_TEMPLATE = {
  academicYear: "2026-2027",
  calendars: [
    {
      studyYears: [1],
      periods: [
        {
          semester: "First",
          teachingStart: "2026-11-26",
          teachingEnd: "2027-03-05",
          examStart: "2027-03-08",
          examEnd: "2027-03-12"
        }
      ],
      events: [],
      source: {
        title: "Official Academic Calendar 2026-2027",
        publishedAt: "2026-08-26",
        url: "",
        fileRef: "",
        note: ""
      }
    }
  ],
  holidays: [
    {
      title: "Khmer New Year",
      startDate: "2027-04-14",
      endDate: "2027-04-16",
      note: "Official public holiday"
    }
  ]
} as const;
