import {
  STUDENT_PORTAL_TIME_ZONE,
  type AcademicCalendarPeriodView,
  type PortalWeeklyNotesView,
  type StudentAcademicCalendarView,
} from "@dse-pms/shared-types";
import { registry } from "../../core/plugins/registry.ts";
import { studentPortalService } from "./service.ts";

type StudentWeeklyNoteSource = {
  date: string;
  classHeld: boolean;
  lecturerName: string | null;
  topic: string;
  learningSummary: string;
};

interface OfferingsWeeklyNotesReadContract {
  studentWeeklyNotes: {
    forOffering(offeringId: string): Promise<StudentWeeklyNoteSource[]>;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function calendarDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
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

export function teachingWeekForDate(
  periods: AcademicCalendarPeriodView[],
  date: string,
): number | null {
  const period = periods.find(
    (item) => date >= item.teachingStart && date <= item.teachingEnd,
  );
  if (!period) return null;
  if (
    period.breakStart &&
    period.breakEnd &&
    date >= period.breakStart &&
    date <= period.breakEnd
  ) {
    return null;
  }

  const elapsed = inclusiveDays(period.teachingStart, date);
  const elapsedBreak = overlapDays(
    period.teachingStart,
    date,
    period.breakStart,
    period.breakEnd,
  );
  return Math.max(1, Math.ceil((elapsed - elapsedBreak) / 7));
}

function studentPortalDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDENT_PORTAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function toPortalWeeklyNotes(
  offeringId: string,
  sources: StudentWeeklyNoteSource[],
  calendar: StudentAcademicCalendarView,
  now = new Date(),
): PortalWeeklyNotesView {
  const periods = calendar.status === "available" ? calendar.periods : [];
  return {
    offeringId,
    currentWeek: teachingWeekForDate(periods, studentPortalDateKey(now)),
    entries: sources.map((source) => ({
      week: teachingWeekForDate(periods, source.date),
      date: source.date,
      classHeld: source.classHeld,
      lecturerName: source.lecturerName,
      topic: source.topic,
      learningSummary: source.learningSummary,
    })),
  };
}

export const studentPortalWeeklyNotesService = {
  async forCourse(userId: string, offeringId: string): Promise<PortalWeeklyNotesView> {
    // Reuse the canonical Student Portal course lookup first so arbitrary or
    // cross-offering IDs fail before any delivery evidence is read.
    await studentPortalService.course(userId, offeringId);

    const offerings = registry.get<OfferingsWeeklyNotesReadContract>("offerings").service;
    const [calendar, sources] = await Promise.all([
      studentPortalService.academicCalendar(userId),
      offerings.studentWeeklyNotes.forOffering(offeringId),
    ]);

    return toPortalWeeklyNotes(offeringId, sources, calendar);
  },
};
