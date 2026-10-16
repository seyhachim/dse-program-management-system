import type { AttendanceSessionSummary, MeetingDay } from "@dse-pms/shared-types";
import { getTeachingWeek } from "./roll-call-state";
import { meetingDayForDate } from "./attendance-schedule";

export const ATTENDANCE_SEMESTER_WEEKS = 16;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type AttendanceWeekOffering = {
  startDate: string | null;
  endDate: string | null;
  meetings: readonly { dayOfWeek: MeetingDay }[];
};

export type AttendanceWeekStatus = "saved" | "missing" | "current" | "future" | "no-class";

export type AttendanceWeek = {
  week: number;
  dates: string[];
  saved: number;
  status: AttendanceWeekStatus;
  targetDate: string | null;
};

export type AttendanceWeekOverview = {
  currentWeek: number;
  weeks: AttendanceWeek[];
};

// Use calendar dates, not local Date arithmetic: the timetable is authored in
// YYYY-MM-DD and must not shift between browsers or around DST transitions.
function parseDate(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    return null;
  }
  return timestamp;
}

function toDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * A week is the seven-day interval from the effective Offering startDate.
 * This matches getTeachingWeek used by Roll Call and never reads or writes
 * student records. Only real recurring meeting days count as scheduled.
 */
export function attendanceWeekOverview(
  offering: AttendanceWeekOffering,
  history: readonly Pick<AttendanceSessionSummary, "date">[],
  today: string,
): AttendanceWeekOverview {
  const start = parseDate(offering.startDate);
  const end = parseDate(offering.endDate);
  const todayTimestamp = parseDate(today);
  if (start === null || end === null || todayTimestamp === null || end < start) {
    return { currentWeek: 0, weeks: [] };
  }

  // Use the same definition of teaching week as the existing Attendance page,
  // without excluding current weeks when an Offering's end date has passed.
  const elapsed = getTeachingWeek(offering.startDate, null, today);
  const currentWeek = Math.min(ATTENDANCE_SEMESTER_WEEKS, Math.max(0, elapsed ?? 0));
  const savedDates = new Set(history.map((item) => item.date));
  const meetingDays = new Set(offering.meetings.map((meeting) => meeting.dayOfWeek));

  const weeks: AttendanceWeek[] = Array.from(
    { length: ATTENDANCE_SEMESTER_WEEKS },
    (_, index): AttendanceWeek => {
      const week = index + 1;
      const weekStart = start + index * WEEK_MS;
      const dates: string[] = [];
      for (let day = 0; day < 7; day += 1) {
        const timestamp = weekStart + day * DAY_MS;
        if (timestamp > end) break;
        const date = toDate(timestamp);
        const weekday = meetingDayForDate(date);
        if (weekday && meetingDays.has(weekday)) dates.push(date);
      }
      const saved = dates.filter((date) => savedDates.has(date)).length;
      const missedDates = dates.filter((date) => date < today && !savedDates.has(date));
      const targetDate = missedDates.at(-1) ??
        dates.find((date) => date === today) ??
        dates.filter((date) => savedDates.has(date)).at(-1) ??
        dates.find((date) => date > today) ??
        dates.at(-1) ?? null;

      let status: AttendanceWeekStatus;
      if (dates.length === 0) status = "no-class";
      else if (saved === dates.length) status = "saved";
      else if (week > currentWeek) status = "future";
      else if (missedDates.length > 0) status = "missing";
      else status = "current";

      return { week, dates, saved, status, targetDate };
    },
  );

  return { currentWeek, weeks };
}

/** Show every past/current week in the dropdown; weeks without meetings are disabled there. */
export function selectableAttendanceWeeks(overview: AttendanceWeekOverview): AttendanceWeek[] {
  return overview.weeks.filter((item) =>
    item.week <= overview.currentWeek,
  );
}
