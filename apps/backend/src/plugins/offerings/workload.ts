import type {
  CourseRef,
  CourseWeeklyContactHoursRef,
  LecturerWorkloadSummary,
  MeetingActivityType,
  MeetingDay,
} from "@dse-pms/shared-types";
import { MEETING_DAYS } from "@dse-pms/shared-types";

export interface WorkloadAssignment {
  id: string;
  lecturerId: string | null;
  term: string;
  sectionCode: string;
  course: CourseRef;
  weeks: CourseWeeklyContactHoursRef[];
  meetings: {
    id: string;
    dayOfWeek: MeetingDay;
    startTime: string;
    endTime: string;
    room: string | null;
    activityType: MeetingActivityType;
  }[];
}

function durationHours(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(":").map(Number) as [number, number];
  const [endHour, endMinute] = endTime.split(":").map(Number) as [number, number];
  return ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60;
}

/** Pure workload calculation kept separate from database/registry I/O for testing. */
export function summarizeLecturerWorkload(
  lecturerId: string,
  assignments: WorkloadAssignment[],
): LecturerWorkloadSummary {
  const scheduleRows = assignments
    .flatMap((assignment) =>
      assignment.meetings.map((meeting) => ({
        meetingId: meeting.id,
        offeringId: assignment.id,
        course: {
          id: assignment.course.id,
          code: assignment.course.code,
          title: assignment.course.title,
        },
        term: assignment.term,
        sectionCode: assignment.sectionCode,
        role: assignment.lecturerId === lecturerId ? "Primary" as const : "Co-Lecturer" as const,
        ...meeting,
        durationHours: durationHours(meeting.startTime, meeting.endTime),
      })),
    )
    .sort(
      (a, b) =>
        MEETING_DAYS.indexOf(a.dayOfWeek) - MEETING_DAYS.indexOf(b.dayOfWeek) ||
        a.startTime.localeCompare(b.startTime) ||
        a.course.code.localeCompare(b.course.code) ||
        a.sectionCode.localeCompare(b.sectionCode),
    );

  const rows = assignments
    .flatMap((assignment) =>
      assignment.weeks.map((week) => ({
        offeringId: assignment.id,
        course: {
          id: assignment.course.id,
          code: assignment.course.code,
          title: assignment.course.title,
        },
        term: assignment.term,
        sectionCode: assignment.sectionCode,
        role: assignment.lecturerId === lecturerId ? "Primary" as const : "Co-Lecturer" as const,
        ...week,
      })),
    )
    .sort(
      (a, b) =>
        a.week - b.week ||
        a.course.code.localeCompare(b.course.code) ||
        a.sectionCode.localeCompare(b.sectionCode),
    );

  const totalsByWeek = new Map<string, { term: string; week: number; totalContactHours: number }>();
  for (const row of rows) {
    const key = `${row.term}\u0000${row.week}`;
    const total = totalsByWeek.get(key) ?? {
      term: row.term,
      week: row.week,
      totalContactHours: 0,
    };
    total.totalContactHours += row.totalContactHours;
    totalsByWeek.set(key, total);
  }
  const weeklyTotals = [...totalsByWeek.values()].sort(
    (a, b) => b.term.localeCompare(a.term) || a.week - b.week,
  );

  return {
    scheduleRows,
    scheduledWeeklyHours:
      Math.round(scheduleRows.reduce((total, row) => total + row.durationHours, 0) * 100) / 100,
    rows,
    weeklyTotals,
    peakWeeklyHours: Math.max(0, ...weeklyTotals.map((week) => week.totalContactHours)),
    totalHours: rows.reduce((total, row) => total + row.totalContactHours, 0),
    coLecturerAssumption: "full",
  };
}
