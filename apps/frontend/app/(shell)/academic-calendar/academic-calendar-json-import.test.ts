import { expect, test } from "bun:test";
import {
  canReuseCorrectionDraftForHolidayOnly,
  holidaysToEvents,
  isCurrentCorrectionDraft,
  mergeImportedRevisionEvents,
  normalizeAcademicYearLabel,
  parseAcademicCalendarJson,
  sameSemesterCoverage,
  sameStudyYearCoverage,
} from "./academic-calendar-json-import";

const validImport = {
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
          examEnd: "2027-03-12",
        },
      ],
      events: [],
      source: { title: "Official calendar", note: "Approved notice" },
    },
  ],
  holidays: [
    { title: "Khmer New Year", startDate: "2027-04-14", endDate: "2027-04-16", note: "Official public holiday" },
  ],
};

test("parses a valid calendar import and keeps optional break dates omitted", () => {
  const result = parseAcademicCalendarJson(JSON.stringify(validImport));
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.calendars[0]?.periods[0]?.breakStart).toBeUndefined();
  expect(result.value.holidays).toHaveLength(1);
});

test("rejects malformed JSON", () => {
  const result = parseAcademicCalendarJson("{not json}");
  expect(result).toEqual({ ok: false, errors: ["The selected file is not valid JSON."] });
});

test("rejects reversed teaching dates and half-defined final exam week", () => {
  const input = structuredClone(validImport);
  input.calendars[0]!.periods[0]!.teachingStart = "2027-03-06";
  input.calendars[0]!.periods[0]!.teachingEnd = "2027-03-05";
  delete (input.calendars[0]!.periods[0] as { examEnd?: string }).examEnd;
  const result = parseAcademicCalendarJson(JSON.stringify(input));
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.errors.some((error) => error.includes("Teaching end cannot precede teaching start"))).toBe(true);
  expect(result.errors.some((error) => error.includes("Exam start and end must be set together"))).toBe(true);
});

test("rejects overlapping study-year and semester coverage inside one import", () => {
  const input = structuredClone(validImport);
  input.calendars.push(structuredClone(input.calendars[0]!));
  const result = parseAcademicCalendarJson(JSON.stringify(input));
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.errors.some((error) => error.includes("covered more than once"))).toBe(true);
});

test("rejects duplicate holidays and reversed holiday ranges", () => {
  const input = structuredClone(validImport);
  input.holidays.push(structuredClone(input.holidays[0]!));
  input.holidays[0]!.endDate = "2027-04-13";
  const result = parseAcademicCalendarJson(JSON.stringify(input));
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.errors.some((error) => error.includes("Holiday end cannot precede start"))).toBe(true);
  expect(result.errors.some((error) => error.includes("Duplicate holiday"))).toBe(true);
});

test("normalizes academic year dash variants without changing identity", () => {
  expect(normalizeAcademicYearLabel("2026–2027")).toBe("2026-2027");
  expect(normalizeAcademicYearLabel(" 2026 - 2027 ")).toBe("2026-2027");
});

test("compares coverage independent of array ordering", () => {
  expect(sameStudyYearCoverage([4, 3], [3, 4])).toBe(true);
  expect(sameStudyYearCoverage([3], [3, 4])).toBe(false);
  expect(sameSemesterCoverage(
    [{ semester: "Second", teachingStart: "2027-01-01", teachingEnd: "2027-01-02" }, { semester: "First", teachingStart: "2026-01-01", teachingEnd: "2026-01-02" }],
    [{ semester: "First" }, { semester: "Second" }],
  )).toBe(true);
});

test("only treats a draft targeting the current published revision as an active correction", () => {
  const currentPublished = { id: "calendar-r2", status: "Published" as const, seriesKey: "series-1" };

  expect(isCurrentCorrectionDraft(
    { status: "Draft", seriesKey: "series-1", supersedesCalendarId: "calendar-r2" },
    currentPublished,
  )).toBe(true);

  expect(isCurrentCorrectionDraft(
    { status: "Draft", seriesKey: "series-1", supersedesCalendarId: "calendar-r1" },
    currentPublished,
  )).toBe(false);

  expect(isCurrentCorrectionDraft(
    { status: "Draft", seriesKey: "other-series", supersedesCalendarId: "calendar-r2" },
    currentPublished,
  )).toBe(false);
});

test("reuses the current correction draft only for holiday-only imports", () => {
  const currentPublished = { id: "calendar-r2", status: "Published" as const, seriesKey: "series-1" };
  const currentDraft = { status: "Draft" as const, seriesKey: "series-1", supersedesCalendarId: "calendar-r2" };

  expect(canReuseCorrectionDraftForHolidayOnly(0, currentDraft, currentPublished)).toBe(true);
  expect(canReuseCorrectionDraftForHolidayOnly(1, currentDraft, currentPublished)).toBe(false);
  expect(canReuseCorrectionDraftForHolidayOnly(
    0,
    { ...currentDraft, supersedesCalendarId: "calendar-r1" },
    currentPublished,
  )).toBe(false);
});

test("converts programme-wide holidays to canonical Holiday events", () => {
  expect(holidaysToEvents(validImport.holidays, 3)).toEqual([
    {
      title: "Khmer New Year",
      type: "Holiday",
      semester: null,
      startDate: "2027-04-14",
      endDate: "2027-04-16",
      note: "Official public holiday",
      sortOrder: 3,
    },
  ]);
});

test("preserves published holidays when a correction JSON omits them", () => {
  const imported = [
    {
      title: "Orientation",
      type: "Orientation" as const,
      semester: "First" as const,
      startDate: "2026-11-20",
      endDate: null,
      note: "Imported event",
      sortOrder: 7,
    },
  ];
  const published = [
    {
      title: "Old non-holiday event",
      type: "Other" as const,
      semester: null,
      startDate: "2026-11-01",
      endDate: null,
      note: "Should be replaced by imported calendar content",
      sortOrder: 0,
    },
    {
      title: "Khmer New Year",
      type: "Holiday" as const,
      semester: null,
      startDate: "2027-04-14",
      endDate: "2027-04-16",
      note: "Official public holiday",
      sortOrder: 1,
    },
  ];

  const merged = mergeImportedRevisionEvents(imported, published);
  expect(merged.map((event) => event.title)).toEqual(["Orientation", "Khmer New Year"]);
  expect(merged.map((event) => event.sortOrder)).toEqual([0, 1]);
});

test("deduplicates published and newly imported programme-wide holidays", () => {
  const existingHoliday = {
    title: "Khmer New Year",
    type: "Holiday" as const,
    semester: null,
    startDate: "2027-04-14",
    endDate: "2027-04-16",
    note: "Existing",
    sortOrder: 4,
  };
  const newHoliday = {
    title: "Constitution Day",
    type: "Holiday" as const,
    semester: null,
    startDate: "2026-09-24",
    endDate: null,
    note: "New",
    sortOrder: 9,
  };

  const merged = mergeImportedRevisionEvents(
    [{ ...existingHoliday, note: "Imported duplicate", sortOrder: 0 }],
    [existingHoliday],
    [existingHoliday, newHoliday],
  );

  expect(merged.map((event) => event.title)).toEqual(["Khmer New Year", "Constitution Day"]);
  expect(merged.map((event) => event.sortOrder)).toEqual([0, 1]);
});
