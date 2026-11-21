import type { StudentAcademicCalendarView } from "@dse-pms/shared-types";
import { toKhmerLunarDate } from "./vendor/khmer-chhankitek/converter";

type AvailableCalendar = Extract<StudentAcademicCalendarView, { status: "available" }>;

export interface KhmerLunarDisplay {
  short: string;
  month: string;
  full: string;
  moonPhase: "កើត" | "រោច";
  buddhistEraYear: number;
}

export interface KhmerLunarMonthCell {
  dateKey: string;
  day: number;
  inMonth: boolean;
  lunar: KhmerLunarDisplay;
}

export interface PublishedDayItem {
  key: string;
  title: string;
  kind: "teaching" | "exam" | "break" | "event";
}

/** Date-only values remain civil dates, independent of the viewer's device timezone. */
export function khmerLunarDisplay(dateKey: string): KhmerLunarDisplay {
  const lunar = toKhmerLunarDate(dateKey);
  return {
    short: lunar.moonDayKhmer + lunar.moonStatus,
    month: lunar.khmerMonth,
    full:
      lunar.moonDayKhmer + lunar.moonStatus +
      " ខែ" + lunar.khmerMonth +
      " ឆ្នាំ" + lunar.animalYear +
      " " + lunar.sak +
      " ព.ស. " + lunar.buddhistEraYearKhmer,
    moonPhase: lunar.moonStatus,
    buddhistEraYear: lunar.buddhistEraYear,
  };
}

/** The student calendar uses Phnom Penh's date even when viewed overseas. */
export function cambodiaTodayDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const field = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return field("year") + "-" + field("month") + "-" + field("day");
}

function dateFromKey(key: string): Date {
  return new Date(key + "T00:00:00.000Z");
}

export function formatGregorianCalendarDate(key: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(dateFromKey(key));
}

export function monthHeading(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function shiftCalendarMonth(
  year: number,
  month: number,
  change: number,
): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + change, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** Monday-first complete weeks; never construct a local-time Date for ISO academic records. */
export function buildKhmerLunarMonthCells(
  year: number,
  month: number,
): KhmerLunarMonthCell[] {
  if (!Number.isInteger(year) || year < 1900 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid or unsupported calendar month.");
  }

  const first = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const monthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalCells = Math.ceil((mondayOffset + monthDays) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, index + 1 - mondayOffset));
    const dateKey = date.getUTCFullYear() + "-" +
      String(date.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(date.getUTCDate()).padStart(2, "0");
    // The library's documented range begins at 1900-01-01.
    const lunar = date.getUTCFullYear() < 1900
      ? { short: "", month: "", full: "", moonPhase: "កើត" as const, buddhistEraYear: 0 }
      : khmerLunarDisplay(dateKey);
    return {
      dateKey,
      day: date.getUTCDate(),
      inMonth: date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month,
      lunar,
    };
  });
}

/** Only published student-scoped PMS records produce official events or period labels. */
export function publishedItemsOnDate(
  calendar: AvailableCalendar,
  dateKey: string,
): PublishedDayItem[] {
  const items: PublishedDayItem[] = [];
  for (const period of calendar.periods) {
    const semester = period.semester === "First" ? "Semester 1" : "Semester 2";
    if (period.teachingStart <= dateKey && dateKey <= period.teachingEnd) {
      items.push({ key: period.id + ":teaching", title: semester + " teaching period", kind: "teaching" });
    }
    if (period.examStart && period.examEnd && period.examStart <= dateKey && dateKey <= period.examEnd) {
      items.push({ key: period.id + ":exam", title: semester + " examinations", kind: "exam" });
    }
    if (period.breakStart && period.breakEnd && period.breakStart <= dateKey && dateKey <= period.breakEnd) {
      items.push({ key: period.id + ":break", title: semester + " break", kind: "break" });
    }
  }
  for (const event of calendar.events) {
    if (event.startDate <= dateKey && dateKey <= (event.endDate ?? event.startDate)) {
      items.push({ key: event.id, title: event.title, kind: "event" });
    }
  }
  return items;
}
