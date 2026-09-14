import type { MeetingDay, OfferingView } from "@dse-pms/shared-types";

const WEEKDAYS: readonly MeetingDay[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Resolve a YYYY-MM-DD value to its timetable weekday without depending on the
 * browser's local timezone. Invalid/incomplete date inputs return null.
 */
export function meetingDayForDate(date: string): MeetingDay | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return null;
  }
  return WEEKDAYS[parsed.getUTCDay()] ?? null;
}

/**
 * Planned offerings normally mean academic delivery activation is still pending.
 * At semester start, however, DSE can have a published Academic Calendar and an
 * assigned recurring timetable before the Approved CourseSpec is available. In
 * that case Attendance must still be able to record the class that actually ran,
 * without falsely changing the Offering to Active.
 *
 * Keep this exception narrow: legacy/unlinked Planned offerings remain hidden.
 */
export function isAttendanceEligibleOffering(offering: OfferingView): boolean {
  if (offering.status !== "Planned") return true;
  return Boolean(offering.academicCalendarPeriodId);
}

/**
 * Attendance may be opened only for a real recurring class on the selected
 * date. Effective start/end dates come from the canonical Academic Calendar
 * for current Offerings (with legacy snapshots retained only for history).
 */
export function isOfferingScheduledOnDate(
  offering: OfferingView,
  date: string,
): boolean {
  if (!isAttendanceEligibleOffering(offering)) return false;
  if (!offering.startDate || !offering.endDate) return false;
  if (date < offering.startDate || date > offering.endDate) return false;

  const dayOfWeek = meetingDayForDate(date);
  if (!dayOfWeek) return false;

  return offering.meetings.some((meeting) => meeting.dayOfWeek === dayOfWeek);
}

export function offeringsScheduledOnDate(
  offerings: readonly OfferingView[],
  date: string,
): OfferingView[] {
  return offerings.filter((offering) => isOfferingScheduledOnDate(offering, date));
}
