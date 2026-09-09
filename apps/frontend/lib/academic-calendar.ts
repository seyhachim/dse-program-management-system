import type {
  AcademicCalendarAuditView,
  AcademicCalendarContextView,
  AcademicCalendarPeriodView,
  AcademicCalendarProgrammeRef,
  AcademicCalendarView,
  AcademicYearView,
  CreateAcademicCalendarInput,
  CreateAcademicYearInput,
  StudentAcademicCalendarView,
  UpdateAcademicCalendarDraftInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

function base(programmeId: string): string {
  return `/api/programme/programmes/${encodeURIComponent(programmeId)}/academic-calendar`;
}

export const academicCalendarApi = {
  programme(): Promise<AcademicCalendarProgrammeRef> {
    return api.get<AcademicCalendarProgrammeRef>("/api/programme/academic-calendar/programme");
  },
  years(programmeId: string): Promise<AcademicYearView[]> {
    return api.get<AcademicYearView[]>(`${base(programmeId)}/years`);
  },
  createYear(programmeId: string, input: CreateAcademicYearInput): Promise<AcademicYearView> {
    return api.post<AcademicYearView>(`${base(programmeId)}/years`, input);
  },
  setCurrentYear(programmeId: string, academicYearId: string): Promise<AcademicYearView> {
    return api.put<AcademicYearView>(`${base(programmeId)}/years/${academicYearId}/current`, {});
  },
  calendars(programmeId: string, academicYearId: string): Promise<AcademicCalendarView[]> {
    return api.get<AcademicCalendarView[]>(`${base(programmeId)}/calendars?academicYearId=${encodeURIComponent(academicYearId)}`);
  },
  get(programmeId: string, calendarId: string): Promise<AcademicCalendarView> {
    return api.get<AcademicCalendarView>(`${base(programmeId)}/calendars/${calendarId}`);
  },
  create(programmeId: string, input: CreateAcademicCalendarInput): Promise<AcademicCalendarView> {
    return api.post<AcademicCalendarView>(`${base(programmeId)}/calendars`, input);
  },
  update(programmeId: string, calendarId: string, input: UpdateAcademicCalendarDraftInput): Promise<AcademicCalendarView> {
    return api.put<AcademicCalendarView>(`${base(programmeId)}/calendars/${calendarId}`, input);
  },
  publish(programmeId: string, calendarId: string): Promise<AcademicCalendarView> {
    return api.post<AcademicCalendarView>(`${base(programmeId)}/calendars/${calendarId}/publish`, {});
  },
  revision(programmeId: string, calendarId: string, reason: string): Promise<AcademicCalendarView> {
    return api.post<AcademicCalendarView>(`${base(programmeId)}/calendars/${calendarId}/revisions`, { reason });
  },
  archive(programmeId: string, calendarId: string): Promise<AcademicCalendarView> {
    return api.post<AcademicCalendarView>(`${base(programmeId)}/calendars/${calendarId}/archive`, {});
  },
  audit(programmeId: string, calendarId: string): Promise<AcademicCalendarAuditView[]> {
    return api.get<AcademicCalendarAuditView[]>(`${base(programmeId)}/calendars/${calendarId}/audit`);
  },
  context(programmeId: string, academicYearId: string, studyYear: number, semester: "First" | "Second"): Promise<AcademicCalendarContextView> {
    const query = new URLSearchParams({ academicYearId, studyYear: String(studyYear), semester });
    return api.get<AcademicCalendarContextView>(`${base(programmeId)}/context?${query.toString()}`);
  },
};

export function academicSemesterLabel(semester: "First" | "Second"): string {
  return semester === "First" ? "Semester 1" : "Semester 2";
}

export function formatAcademicDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function calendarDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCalendarDays(value: string, days: number): string {
  const date = calendarDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inclusiveDays(start: string, end: string): number {
  return Math.floor((calendarDate(end).getTime() - calendarDate(start).getTime()) / DAY_MS) + 1;
}

function overlapDays(
  start: string,
  end: string,
  breakStart: string | null,
  breakEnd: string | null,
): number {
  if (!breakStart || !breakEnd) return 0;
  const overlapStart = breakStart > start ? breakStart : start;
  const overlapEnd = breakEnd < end ? breakEnd : end;
  return overlapStart <= overlapEnd ? inclusiveDays(overlapStart, overlapEnd) : 0;
}

function isBreakDate(period: AcademicCalendarPeriodView, date: string): boolean {
  return Boolean(
    period.breakStart &&
      period.breakEnd &&
      date >= period.breakStart &&
      date <= period.breakEnd,
  );
}

function teachingDateForOrdinal(
  period: AcademicCalendarPeriodView,
  ordinal: number,
): string | null {
  let cursor = period.teachingStart;
  let currentOrdinal = 0;

  while (cursor <= period.teachingEnd) {
    if (!isBreakDate(period, cursor)) {
      currentOrdinal += 1;
      if (currentOrdinal === ordinal) return cursor;
    }
    cursor = addCalendarDays(cursor, 1);
  }
  return null;
}

function teachingWeekCount(period: AcademicCalendarPeriodView): number {
  const totalDays = inclusiveDays(period.teachingStart, period.teachingEnd);
  const breakDays = overlapDays(
    period.teachingStart,
    period.teachingEnd,
    period.breakStart,
    period.breakEnd,
  );
  return Math.max(1, Math.ceil((totalDays - breakDays) / 7));
}

export type StudentTeachingContext =
  | {
      kind: "teaching";
      semester: "First" | "Second";
      week: number;
      totalWeeks: number;
      startDate: string;
      endDate: string;
    }
  | {
      kind: "break";
      semester: "First" | "Second";
      nextWeek: number;
      totalWeeks: number;
      resumeDate: string | null;
    }
  | {
      kind: "upcoming";
      semester: "First" | "Second";
      startDate: string;
    }
  | {
      kind: "between";
      nextSemester: "First" | "Second";
      resumeDate: string;
    }
  | { kind: "complete" }
  | null;

/**
 * Resolve student-facing teaching-week context only from the already published
 * Student Academic Calendar projection. CourseSpec/weekly-plan data is never
 * consulted here, so a missing/draft CourseSpec cannot fabricate week state.
 */
export function resolveStudentTeachingContext(
  calendar: StudentAcademicCalendarView,
  now = new Date(),
): StudentTeachingContext {
  if (calendar.status !== "available" || calendar.periods.length === 0) return null;

  const today = localDateKey(now);
  const periods = [...calendar.periods].sort((a, b) =>
    a.teachingStart.localeCompare(b.teachingStart),
  );

  for (const period of periods) {
    const totalWeeks = teachingWeekCount(period);

    if (
      period.breakStart &&
      period.breakEnd &&
      today >= period.breakStart &&
      today <= period.breakEnd
    ) {
      const teachingDaysBeforeBreak = Math.max(
        0,
        inclusiveDays(period.teachingStart, period.breakStart) - 1,
      );
      const nextWeek = Math.min(
        totalWeeks,
        Math.max(1, Math.floor(teachingDaysBeforeBreak / 7) + 1),
      );
      const resumeCandidate = addCalendarDays(period.breakEnd, 1);
      return {
        kind: "break",
        semester: period.semester,
        nextWeek,
        totalWeeks,
        resumeDate:
          resumeCandidate <= period.teachingEnd ? resumeCandidate : null,
      };
    }

    if (today >= period.teachingStart && today <= period.teachingEnd) {
      const elapsed = inclusiveDays(period.teachingStart, today);
      const elapsedBreak = overlapDays(
        period.teachingStart,
        today,
        period.breakStart,
        period.breakEnd,
      );
      const teachingOrdinal = Math.max(1, elapsed - elapsedBreak);
      const week = Math.min(totalWeeks, Math.ceil(teachingOrdinal / 7));
      const startDate =
        teachingDateForOrdinal(period, (week - 1) * 7 + 1) ?? period.teachingStart;
      const endDate =
        teachingDateForOrdinal(period, Math.min(week * 7, totalWeeks * 7)) ??
        period.teachingEnd;
      return {
        kind: "teaching",
        semester: period.semester,
        week,
        totalWeeks,
        startDate,
        endDate,
      };
    }
  }

  const nextPeriod = periods.find((period) => today < period.teachingStart);
  if (nextPeriod) {
    const priorPeriod = [...periods]
      .reverse()
      .find((period) => today > period.teachingEnd);
    return priorPeriod
      ? {
          kind: "between",
          nextSemester: nextPeriod.semester,
          resumeDate: nextPeriod.teachingStart,
        }
      : {
          kind: "upcoming",
          semester: nextPeriod.semester,
          startDate: nextPeriod.teachingStart,
        };
  }

  return { kind: "complete" };
}

export function formatAcademicShortDateRange(start: string, end: string): string {
  const startDate = calendarDate(start);
  const endDate = calendarDate(end);
  const startDay = startDate.getUTCDate();
  const endDay = endDate.getUTCDate();
  const startMonth = startDate.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const endMonth = endDate.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });

  return startMonth === endMonth
    ? `${startDay}–${endDay} ${endMonth}`
    : `${startDay} ${startMonth}–${endDay} ${endMonth}`;
}
