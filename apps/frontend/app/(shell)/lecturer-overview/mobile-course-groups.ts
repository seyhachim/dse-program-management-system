import {
  MEETING_DAYS,
  type OfferingMeetingView,
  type OfferingStatus,
  type OfferingView,
} from "@dse-pms/shared-types";

export type LecturerOfferingRole = "Primary Lecturer" | "Co-Lecturer";

export interface LecturerCourseOfferingGroup {
  key: string;
  offerings: OfferingView[];
  commonRole: LecturerOfferingRole | null;
  commonStatus: OfferingStatus | null;
  commonTeachingPeriod: {
    startDate: string | null;
    endDate: string | null;
  } | null;
}

const DAY_ORDER = new Map(MEETING_DAYS.map((day, index) => [day, index]));

export function lecturerOfferingRole(
  offering: OfferingView,
  lecturerId: string | null | undefined,
): LecturerOfferingRole {
  return lecturerId && offering.lecturer?.id === lecturerId
    ? "Primary Lecturer"
    : "Co-Lecturer";
}

function offeringGroupKey(offering: OfferingView): string {
  if (!offering.course) return `offering:${offering.id}`;

  const periodIdentity =
    offering.academicCalendarPeriodId ??
    offering.academicCalendar?.periodId ??
    `legacy:${offering.term}:${offering.programmeYear ?? "none"}:${
      offering.semester ?? "none"
    }`;

  return [
    offering.course.id,
    periodIdentity,
    offering.term,
    offering.programmeYear ?? "none",
    offering.semester ?? "none",
  ].join(":");
}

function commonValue<T>(values: T[]): T | null {
  const first = values[0];
  if (first === undefined) return null;
  return values.every((value) => value === first) ? first : null;
}

export function groupLecturerOfferings(
  offerings: OfferingView[],
  lecturerId: string | null | undefined,
): LecturerCourseOfferingGroup[] {
  const grouped = new Map<string, OfferingView[]>();

  for (const offering of offerings) {
    const key = offeringGroupKey(offering);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(offering);
    } else {
      grouped.set(key, [offering]);
    }
  }

  return [...grouped.entries()].map(([key, groupedOfferings]) => {
    const sortedOfferings = [...groupedOfferings].sort((left, right) =>
      left.sectionCode.localeCompare(right.sectionCode, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
    const commonRole = commonValue(
      sortedOfferings.map((offering) => lecturerOfferingRole(offering, lecturerId)),
    );
    const commonStatus = commonValue(
      sortedOfferings.map((offering) => offering.status),
    );
    const first = sortedOfferings[0]!;
    const hasCommonTeachingPeriod = sortedOfferings.every(
      (offering) =>
        offering.startDate === first.startDate && offering.endDate === first.endDate,
    );

    return {
      key,
      offerings: sortedOfferings,
      commonRole,
      commonStatus,
      commonTeachingPeriod: hasCommonTeachingPeriod
        ? { startDate: first.startDate, endDate: first.endDate }
        : null,
    };
  });
}

export function compactAcademicPeriodLabel(offering: OfferingView): string {
  const academicYear = offering.academicCalendar?.academicYearLabel ?? offering.term;
  const studyYear = offering.programmeYear ? `Y${offering.programmeYear}` : null;
  const semester =
    offering.semester === "First"
      ? "S1"
      : offering.semester === "Second"
        ? "S2"
        : null;

  return [academicYear, studyYear, semester].filter(Boolean).join(" · ");
}

interface CompactMeetingRange {
  dayOfWeek: OfferingMeetingView["dayOfWeek"];
  startTime: string;
  endTime: string;
  room: string | null;
}

export function compactScheduleLabel(
  meetings: OfferingMeetingView[],
): string {
  if (meetings.length === 0) return "Schedule not set";

  const sorted = [...meetings].sort((left, right) => {
    const dayDifference =
      (DAY_ORDER.get(left.dayOfWeek) ?? Number.MAX_SAFE_INTEGER) -
      (DAY_ORDER.get(right.dayOfWeek) ?? Number.MAX_SAFE_INTEGER);
    if (dayDifference !== 0) return dayDifference;
    return left.startTime.localeCompare(right.startTime);
  });

  const ranges: CompactMeetingRange[] = [];
  for (const meeting of sorted) {
    const previous = ranges[ranges.length - 1];
    if (
      previous &&
      previous.dayOfWeek === meeting.dayOfWeek &&
      previous.room === meeting.room &&
      previous.endTime === meeting.startTime
    ) {
      previous.endTime = meeting.endTime;
      continue;
    }

    ranges.push({
      dayOfWeek: meeting.dayOfWeek,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      room: meeting.room,
    });
  }

  return ranges
    .map(
      (range) =>
        `${range.dayOfWeek.slice(0, 3)} ${range.startTime}–${range.endTime}`,
    )
    .join(" · ");
}
