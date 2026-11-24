import { Prisma } from "@prisma/client";
import type { WeeklyTeachingReport, WeeklyTeachingSession } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { deriveWeeklyTeachingStatus, summarizeWeeklyTeaching } from "./weekly-teaching-model.ts";

const DAY_MS = 86_400_000;
const MAX_OFFERINGS = 500;
const MAX_SESSIONS = 1_200;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

interface EvidenceRow {
  id: string;
  offeringMeetingId: string;
  sessionDate: Date;
  approvedLeaveRequestId: string | null;
  classSessionStatus: string | null;
  lecturerArrivalStatus: string | null;
  classOccurred: boolean | null;
  deliveredMinutes: number | null;
  coverage: WeeklyTeachingSession["coverage"];
  actualTopic: string | null;
  recordedAt: Date | null;
}

/** Exact DB date values are stored at UTC midnight; local class end uses +07:00. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function minutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("Invalid timetable clock time");
  }
  const [h, m] = value.split(":").map(Number);
  return h! * 60 + m!;
}

function teachingEndInstant(date: string, time: string): Date {
  return new Date(date + "T" + time + ":00+07:00");
}

/**
 * Read-only programme monitoring. Never materialize occurrences from a GET:
 * build the seven planned dates from canonical OfferingMeeting schedules so
 * sessions with NO student monitor evidence still appear in the report.
 *
 * The Phase-1 counts are operational, not verified recovery hours or personal
 * lecturer-absence findings (#935/#936). Private leave fields are never read.
 */
export const weeklyTeachingService = {
  async report(weekStart: string, now = new Date()): Promise<WeeklyTeachingReport> {
    const from = new Date(weekStart + "T00:00:00.000Z");
    const through = new Date(from.getTime() + 6 * DAY_MS);
    const next = new Date(from.getTime() + 7 * DAY_MS);
    const weekEnd = dateOnly(through);
    const plannedDates = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(from.getTime() + i * DAY_MS);
      return { date: dateOnly(date), dayOfWeek: DAYS[date.getUTCDay()]! };
    });

    const [offerings, unboundedActiveOfferings] = await Promise.all([
      prisma.offering.findMany({
        where: {
          course: { programmeId: DEFAULT_PROGRAMME_ID },
          status: { in: ["Active", "Completed", "Planned"] },
          meetings: { some: {} },
          OR: [
            { academicCalendarPeriod: { is: {
              teachingStart: { lte: through }, teachingEnd: { gte: from },
            } } },
            { academicCalendarPeriodId: null, startDate: { lte: through }, endDate: { gte: from } },
          ],
        },
        select: {
          id: true, term: true, sectionCode: true, programmeYear: true,
          startDate: true, endDate: true,
          course: { select: { code: true, title: true } },
          lecturer: { select: { id: true, name: true } },
          coLecturers: { select: { lecturer: { select: { id: true, name: true } } } },
          meetings: {
            select: {
              id: true, dayOfWeek: true, startTime: true, endTime: true,
              room: true,
              lecturers: { select: { lecturer: { select: { id: true, name: true } } } },
            },
          },
          academicCalendarPeriod: {
            select: {
              calendarId: true, teachingStart: true, teachingEnd: true,
              breakStart: true, breakEnd: true,
              calendar: { select: { status: true } },
            },
          },
          courseSpec: {
            select: {
              reviewStatus: true,
              weeks: { select: { week: true, topic: true } },
            },
          },
        },
        orderBy: [{ course: { code: "asc" } }, { sectionCode: "asc" }],
        take: MAX_OFFERINGS + 1,
      }),
      prisma.offering.count({
        where: {
          course: { programmeId: DEFAULT_PROGRAMME_ID },
          status: "Active",
          meetings: { some: {} },
          academicCalendarPeriodId: null,
          OR: [{ startDate: null }, { endDate: null }],
        },
      }),
    ]);

    if (offerings.length > MAX_OFFERINGS) {
      throw new Error("Programme reporting query exceeded the bounded offering limit");
    }

    const meetingIds = offerings.flatMap((offering) => offering.meetings.map((meeting) => meeting.id));
    const calendarIds = [...new Set(
      offerings.filter((offering) => offering.academicCalendarPeriod?.calendar.status === "Published")
        .map((offering) => offering.academicCalendarPeriod!.calendarId),
    )];

    const [occurrences, calendarHolidays] = await Promise.all([
      meetingIds.length
        ? prisma.$queryRaw<EvidenceRow[]>`
            SELECT occ."id", occ."offeringMeetingId", occ."sessionDate", occ."approvedLeaveRequestId",
              session."status"::text AS "classSessionStatus",
              arrival."status"::text AS "lecturerArrivalStatus",
              delivery."classOccurred", delivery."deliveredMinutes",
              delivery."coverage"::text AS "coverage",
              delivery."actualTopic", delivery."recordedAt"
            FROM "pms_attendance"."TeachingSessionOccurrence" occ
            LEFT JOIN "pms_attendance"."ClassSessionStatus" session
              ON session."occurrenceId" = occ."id"
            LEFT JOIN "pms_attendance"."LecturerArrivalConfirmation" arrival
              ON arrival."occurrenceId" = occ."id"
            LEFT JOIN "pms_attendance"."TeachingSessionDelivery" delivery
              ON delivery."occurrenceId" = occ."id"
            WHERE occ."offeringMeetingId" IN (${Prisma.join(meetingIds)})
              AND occ."sessionDate" >= ${weekStart}::date
              AND occ."sessionDate" < ${dateOnly(next)}::date
          `
        : Promise.resolve([] as EvidenceRow[]),
      calendarIds.length
        ? prisma.academicCalendarEvent.findMany({
            where: {
              calendarId: { in: calendarIds },
              type: { in: ["Holiday", "SemesterBreak"] },
              startDate: { lte: through },
              OR: [
                { endDate: { gte: from } },
                { endDate: null, startDate: { gte: from } },
              ],
            },
            select: {
              calendarId: true, title: true, startDate: true, endDate: true,
            },
            orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
          })
        : Promise.resolve([]),
    ]);

    const evidenceByMeetingDate = new Map(
      occurrences.map((row) => [row.offeringMeetingId + ":" + dateOnly(row.sessionDate), row]),
    );

    const sessions: WeeklyTeachingSession[] = [];
    for (const offering of offerings) {
      const period = offering.academicCalendarPeriod;
      const teachingStart = period?.teachingStart ?? offering.startDate;
      const teachingEnd = period?.teachingEnd ?? offering.endDate;
      if (!teachingStart || !teachingEnd) continue;
      const begins = dateOnly(teachingStart);
      const ends = dateOnly(teachingEnd);

      for (const meeting of offering.meetings) {
        const duration = minutes(meeting.endTime) - minutes(meeting.startTime);
        if (duration <= 0) {
          throw new Error("Timetable contains non-positive duration for a meeting");
        }
        // When split-teaching ownership was not explicitly recorded, display
        // the team, never guess a specific lecturer's absence.
        const assigned = meeting.lecturers.length
          ? meeting.lecturers.map((assignment) => assignment.lecturer)
          : [
              ...(offering.lecturer ? [offering.lecturer] : []),
              ...offering.coLecturers.map((assignment) => assignment.lecturer),
            ];
        const lecturerTeam = [...new Map(assigned.map((lecturer) => [lecturer.id, lecturer])).values()];

        for (const day of plannedDates) {
          if (day.dayOfWeek !== meeting.dayOfWeek) continue;
          if (day.date < begins || day.date > ends) continue;
          const record = evidenceByMeetingDate.get(meeting.id + ":" + day.date);
          const weekNumber = Math.floor(
            (new Date(day.date + "T00:00:00.000Z").getTime() - teachingStart.getTime()) / (7 * DAY_MS),
          ) + 1;
          const plannedWeeks = offering.courseSpec?.reviewStatus === "Approved" && weekNumber > 0
            ? offering.courseSpec.weeks.filter((week) => week.week === weekNumber)
            : [];
          const plannedTopic = plannedWeeks.length === 1 ? plannedWeeks[0]!.topic : null;
          const isBreak = Boolean(
            period?.breakStart && period.breakEnd
            && day.date >= dateOnly(period.breakStart) && day.date <= dateOnly(period.breakEnd),
          );
          const holiday = calendarHolidays.find((event) =>
            event.calendarId === period?.calendarId
            && day.date >= dateOnly(event.startDate)
            && day.date <= dateOnly(event.endDate ?? event.startDate),
          );
          const holidayName = holiday?.title ?? (isBreak ? "Academic break" : null);
          const approvedLeave = Boolean(record?.approvedLeaveRequestId);
          const coverage = record?.coverage ?? null;
          const status = deriveWeeklyTeachingStatus({
            classOccurred: record?.classOccurred ?? null,
            coverage,
            explicitSessionStatus: record?.classSessionStatus ?? null,
            officialHoliday: Boolean(holidayName),
            approvedLeave,
            offeringActivated: offering.status !== "Planned",
            ended: teachingEndInstant(day.date, meeting.endTime) <= now,
          });
          sessions.push({
            meetingId: meeting.id,
            offeringId: offering.id,
            occurrenceId: record?.id ?? null,
            date: day.date,
            dayOfWeek: day.dayOfWeek,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            room: meeting.room,
            courseCode: offering.course.code,
            courseTitle: offering.course.title,
            sectionCode: offering.sectionCode,
            offeringStatus: offering.status,
            programmeYear: offering.programmeYear,
            term: offering.term,
            lecturerIds: lecturerTeam.map((lecturer) => lecturer.id),
            lecturerNames: lecturerTeam.map((lecturer) => lecturer.name),
            plannedWeek: plannedTopic === null ? null : weekNumber,
            plannedTopic,
            actualTopic: record?.actualTopic ?? null,
            coverage,
            status,
            scheduledMinutes: duration,
            deliveredMinutes: record?.classOccurred ? Math.max(0, record.deliveredMinutes ?? 0) : 0,
            arrivalRecorded: record?.lecturerArrivalStatus === "Present",
            approvedLeave,
            classSessionStatus: record?.classSessionStatus ?? null,
            holidayName,
            evidenceRecordedAt: record?.recordedAt?.toISOString() ?? null,
          });
          if (sessions.length > MAX_SESSIONS) {
            throw new Error("Programme reporting query exceeded the bounded weekly session limit");
          }
        }
      }
    }

    sessions.sort((a, b) =>
      a.date.localeCompare(b.date)
      || a.startTime.localeCompare(b.startTime)
      || a.courseCode.localeCompare(b.courseCode)
      || a.sectionCode.localeCompare(b.sectionCode)
      || a.meetingId.localeCompare(b.meetingId),
    );

    return {
      programmeId: DEFAULT_PROGRAMME_ID,
      weekStart,
      weekEnd,
      generatedAt: now.toISOString(),
      unboundedActiveOfferings,
      summary: summarizeWeeklyTeaching(sessions),
      sessions,
    };
  },
};
