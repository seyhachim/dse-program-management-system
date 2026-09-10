import type { OfferingView } from "@dse-pms/shared-types";

export type LecturerOverviewOffering = Pick<
  OfferingView,
  | "id"
  | "term"
  | "sectionCode"
  | "status"
  | "capacity"
  | "enrolledCount"
  | "semester"
  | "programmeYear"
  | "academicCalendarPeriodId"
  | "startDate"
  | "endDate"
  | "meetings"
  | "course"
>;

export interface UpcomingTeaching<
  TOffering extends LecturerOverviewOffering = LecturerOverviewOffering,
> {
  offering: TOffering;
  meeting: TOffering["meetings"][number];
  startsAt: Date;
  endsAt: Date;
}

export interface MobileOfferingGroup<
  TOffering extends LecturerOverviewOffering = LecturerOverviewOffering,
> {
  key: string;
  course: TOffering["course"];
  term: string;
  semester: TOffering["semester"];
  programmeYear: number | null;
  startDate: string | null;
  endDate: string | null;
  sections: Array<{
    offering: TOffering;
    next: UpcomingTeaching<TOffering> | null;
  }>;
  next: UpcomingTeaching<TOffering> | null;
}

const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const DISPLAY_DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

function parseDateOnly(value: string, endOfDay = false): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
}

function dateAtTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0,
  );
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextMeetingFromAnchor(
  meeting: LecturerOverviewOffering["meetings"][number],
  anchor: Date,
): { startsAt: Date; endsAt: Date } | null {
  const targetDay = DAY_INDEX[meeting.dayOfWeek];
  if (targetDay === undefined) return null;

  const dayOffset = (targetDay - anchor.getDay() + 7) % 7;
  let startsAt = dateAtTime(addDays(anchor, dayOffset), meeting.startTime);
  let endsAt = dateAtTime(startsAt, meeting.endTime);

  // Keep an in-progress class as the first teaching commitment. Once its end
  // time has passed, the next occurrence is the following week.
  if (endsAt <= anchor) {
    startsAt = addDays(startsAt, 7);
    endsAt = addDays(endsAt, 7);
  }

  return { startsAt, endsAt };
}

/**
 * Resolve the next real timetable occurrence for one offering using device-local
 * time. Offering teaching dates bound the weekly recurrence, so completed terms
 * cannot reappear as upcoming simply because the weekday matches again.
 */
export function nextTeachingOccurrence<
  TOffering extends LecturerOverviewOffering,
>(
  offering: TOffering,
  now: Date,
): UpcomingTeaching<TOffering> | null {
  if (offering.status === "Completed" || offering.meetings.length === 0) {
    return null;
  }

  const startBoundary = offering.startDate
    ? parseDateOnly(offering.startDate)
    : null;
  const endBoundary = offering.endDate
    ? parseDateOnly(offering.endDate, true)
    : null;

  if (endBoundary && now > endBoundary) return null;

  const anchor =
    startBoundary && startBoundary > now ? startBoundary : new Date(now);

  const candidates = offering.meetings
    .map((meeting) => {
      const occurrence = nextMeetingFromAnchor(meeting, anchor);
      if (!occurrence) return null;

      if (startBoundary && occurrence.startsAt < startBoundary) return null;
      if (endBoundary && occurrence.startsAt > endBoundary) return null;

      return {
        offering,
        meeting,
        ...occurrence,
      } satisfies UpcomingTeaching<TOffering>;
    })
    .filter(
      (candidate): candidate is UpcomingTeaching<TOffering> => candidate !== null,
    )
    .sort((a, b) => {
      const byStart = a.startsAt.getTime() - b.startsAt.getTime();
      if (byStart !== 0) return byStart;
      return a.meeting.startTime.localeCompare(b.meeting.startTime);
    });

  return candidates[0] ?? null;
}

function periodIdentity(offering: LecturerOverviewOffering): string {
  if (offering.academicCalendarPeriodId) {
    return `calendar:${offering.academicCalendarPeriodId}`;
  }

  // Legacy rows may not have a canonical calendar-period id. Keep those safely
  // separated by their visible academic context instead of merging by course only.
  return [
    "legacy",
    offering.term,
    offering.programmeYear ?? "",
    offering.semester ?? "",
    offering.startDate ?? "",
    offering.endDate ?? "",
  ].join(":");
}

function groupKey(offering: LecturerOverviewOffering): string {
  if (!offering.course) return `offering:${offering.id}`;
  return `course:${offering.course.id}:${periodIdentity(offering)}`;
}

function compareUpcoming<TOffering extends LecturerOverviewOffering>(
  a: UpcomingTeaching<TOffering> | null,
  b: UpcomingTeaching<TOffering> | null,
): number {
  if (a && b) return a.startsAt.getTime() - b.startsAt.getTime();
  if (a) return -1;
  if (b) return 1;
  return 0;
}

/** Group same-course sections for mobile and sort the entire view next-class first. */
export function groupOfferingsForMobile<
  TOffering extends LecturerOverviewOffering,
>(offerings: TOffering[], now: Date): MobileOfferingGroup<TOffering>[] {
  const grouped = new Map<string, TOffering[]>();

  for (const offering of offerings) {
    const key = groupKey(offering);
    const existing = grouped.get(key);
    if (existing) existing.push(offering);
    else grouped.set(key, [offering]);
  }

  return [...grouped.entries()]
    .map(([key, groupOfferings]) => {
      const first = groupOfferings[0];
      const sections = groupOfferings
        .map((offering) => ({
          offering,
          next: nextTeachingOccurrence(offering, now),
        }))
        .sort((a, b) => {
          const byNext = compareUpcoming(a.next, b.next);
          if (byNext !== 0) return byNext;
          return a.offering.sectionCode.localeCompare(b.offering.sectionCode);
        });

      return {
        key,
        course: first.course,
        term: first.term,
        semester: first.semester,
        programmeYear: first.programmeYear,
        startDate: first.startDate,
        endDate: first.endDate,
        sections,
        next: sections.find((section) => section.next)?.next ?? null,
      } satisfies MobileOfferingGroup<TOffering>;
    })
    .sort((a, b) => {
      const byNext = compareUpcoming(a.next, b.next);
      if (byNext !== 0) return byNext;

      const courseA = a.course?.code ?? "";
      const courseB = b.course?.code ?? "";
      const byCourse = courseA.localeCompare(courseB);
      if (byCourse !== 0) return byCourse;
      return a.term.localeCompare(b.term);
    });
}

/** Compact a weekly timetable without repeating the weekday for adjacent slots. */
export function compactScheduleLabel(
  offering: LecturerOverviewOffering,
): string {
  if (offering.meetings.length === 0) return "Schedule not set";

  const byDay = new Map<string, LecturerOverviewOffering["meetings"]>();
  for (const meeting of offering.meetings) {
    const dayMeetings = byDay.get(meeting.dayOfWeek) ?? [];
    dayMeetings.push(meeting);
    byDay.set(meeting.dayOfWeek, dayMeetings);
  }

  return DISPLAY_DAY_ORDER.filter((day) => byDay.has(day))
    .map((day) => {
      const times = [...(byDay.get(day) ?? [])]
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((meeting) => `${meeting.startTime}–${meeting.endTime}`)
        .join(", ");
      return `${day.slice(0, 3)} ${times}`;
    })
    .join(" · ");
}

function localDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

export function upcomingTeachingLabel(
  occurrence: UpcomingTeaching,
  now: Date,
): string {
  if (occurrence.startsAt <= now && occurrence.endsAt > now) {
    return `Now · ${occurrence.meeting.startTime}–${occurrence.meeting.endTime}`;
  }

  const dayDistance = localDayNumber(occurrence.startsAt) - localDayNumber(now);
  const dayLabel =
    dayDistance === 0
      ? "Today"
      : dayDistance === 1
        ? "Tomorrow"
        : new Intl.DateTimeFormat("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
          }).format(occurrence.startsAt);

  return `${dayLabel} · ${occurrence.meeting.startTime}–${occurrence.meeting.endTime}`;
}
