import { describe, expect, test } from "bun:test";
import { AcademicCalendarPeriodInputSchema, CreateAcademicCalendarSchema } from "@dse-pms/shared-types";
import { buildAcademicCalendarTimeline, mergeAcademicCalendarEventsForStudyYear } from "./academic-calendar-service.ts";
describe("academic calendar domain", () => {
  test("rejects reversed teaching periods and half-defined exam ranges", () => {
    expect(AcademicCalendarPeriodInputSchema.safeParse({ semester: "First", teachingStart: "2026-09-20", teachingEnd: "2026-09-01" }).success).toBe(false);
    expect(AcademicCalendarPeriodInputSchema.safeParse({ semester: "First", teachingStart: "2026-09-01", teachingEnd: "2027-01-15", examStart: "2027-01-20" }).success).toBe(false);
  });
  test("supports one calendar shared by Years 3 and 4 without duplicate semesters", () => {
    const result = CreateAcademicCalendarSchema.safeParse({ academicYearId: crypto.randomUUID(), studyYears: [3, 4], periods: [{ semester: "First", teachingStart: "2026-09-16", teachingEnd: "2027-01-16" }], events: [], sourceTitle: "Official notice", sourceNote: "Faculty notice" });
    expect(result.success).toBe(true);
    expect(CreateAcademicCalendarSchema.safeParse({ academicYearId: crypto.randomUUID(), studyYears: [3, 3], periods: [{ semester: "First", teachingStart: "2026-09-16", teachingEnd: "2027-01-16" }], events: [] }).success).toBe(false);
  });
  test("next-event timeline excludes already ended events deterministically", () => {
    const events = buildAcademicCalendarTimeline([{ id: "p1", calendarId: "c1", semester: "First", teachingStart: "2026-09-01", teachingEnd: "2027-01-10", examStart: "2027-01-15", examEnd: "2027-01-20", breakStart: null, breakEnd: null }], [{ id: "e1", calendarId: "c1", title: "Orientation", type: "Orientation", semester: "First", startDate: "2026-08-20", endDate: "2026-08-20", note: "", sortOrder: 0 }], "2026-08-25");
    expect(events[0]?.title).toBe("Semester 1 teaching");
    expect(events.some((event) => event.title === "Orientation")).toBe(false);
  });
  test("reuses published holidays programme-wide while keeping other events study-year scoped", () => {
    const scoped = [{ id: "orientation-y1", calendarId: "c1", title: "Year 1 Orientation", type: "Orientation" as const, semester: "First" as const, startDate: "2026-09-01", endDate: null, note: "", sortOrder: 0 }];
    const published = [
      { id: "kh-new-year-y1", calendarId: "c1", title: "Khmer New Year", type: "Holiday" as const, semester: null, startDate: "2027-04-14", endDate: "2027-04-16", note: "", sortOrder: 0 },
      { id: "kh-new-year-y3", calendarId: "c34", title: "Khmer New Year", type: "Holiday" as const, semester: null, startDate: "2027-04-14", endDate: "2027-04-16", note: "duplicate historical entry", sortOrder: 1 },
      { id: "orientation-y3", calendarId: "c34", title: "Year 3 Orientation", type: "Orientation" as const, semester: "First" as const, startDate: "2026-09-02", endDate: null, note: "", sortOrder: 0 },
    ];
    const merged = mergeAcademicCalendarEventsForStudyYear(scoped, published);
    expect(merged.map((event) => event.title)).toEqual(["Year 1 Orientation", "Khmer New Year"]);
    expect(merged.filter((event) => event.type === "Holiday")).toHaveLength(1);
  });
});
