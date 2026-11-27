import { randomUUID } from "node:crypto";
import type {
  ApprovedMakeUpAttendanceDate, MakeUpClassView, ProposeMakeUpClass, ReviewMakeUpClass,
} from "@dse-pms/shared-types";
import type { AuthUser } from "../../core/auth/token.ts";
import { hasAnyRoleInProgramme } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { classDeliveryService } from "./class-delivery-service.ts";

export class MakeUpClassNotFoundError extends Error {}
export class MakeUpClassForbiddenError extends Error {}
export class MakeUpClassConflictError extends Error {}
export class MakeUpClassValidationError extends Error {}

const MANAGERS = ["admin", "program_coordinator"] as const;
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);
const dayOf = (value: string): string => DAYS[new Date(value + "T00:00:00.000Z").getUTCDay()]!;
const overlapping = (a: string, b: string, c: string, d: string) => a < d && c < b;

type Row = {
  id: string;
  offeringId: string;
  originalOccurrenceId: string;
  offeringMeetingId: string;
  originalDate: Date;
  replacementDate: Date;
  startTime: string;
  endTime: string;
  room: string | null;
  note: string;
  status: MakeUpClassView["status"];
  proposedById: string;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNote: string;
  createdAt: Date;
  courseCode: string;
  sectionCode: string;
  programmeId: string;
  lecturerId: string | null;
};

function manager(user: AuthUser, programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, [...MANAGERS], programmeId);
}

function toView(row: Row): MakeUpClassView {
  return {
    id: row.id, offeringId: row.offeringId, offeringMeetingId: row.offeringMeetingId,
    originalOccurrenceId: row.originalOccurrenceId, originalDate: dateOnly(row.originalDate),
    replacementDate: dateOnly(row.replacementDate), startTime: row.startTime,
    endTime: row.endTime, room: row.room, note: row.note, status: row.status,
    proposedById: row.proposedById, reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt?.toISOString() ?? null, reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(), courseCode: row.courseCode,
    sectionCode: row.sectionCode,
  };
}

const projection = `
  SELECT r."id", r."offeringId", r."originalOccurrenceId",
    occ."offeringMeetingId", occ."sessionDate" AS "originalDate",
    r."replacementDate", r."startTime", r."endTime", r."room",
    r."note", r."status", r."proposedById", r."reviewedById",
    r."reviewedAt", r."reviewNote", r."createdAt",
    c."code" AS "courseCode", o."sectionCode", c."programmeId", o."lecturerId"
  FROM "pms_attendance"."MakeUpClassRequest" r
  JOIN "pms_attendance"."TeachingSessionOccurrence" occ ON occ."id" = r."originalOccurrenceId"
  JOIN "Offering" o ON o."id" = r."offeringId"
  JOIN "Course" c ON c."id" = o."courseId"
`;

async function byId(id: string): Promise<Row> {
  const rows = await prisma.$queryRawUnsafe<Row[]>(projection + ' WHERE r."id" = $1 LIMIT 1', id);
  if (!rows[0]) throw new MakeUpClassNotFoundError("Make-up request not found");
  return rows[0];
}

async function activeDateConflict(
  offeringId: string, proposerId: string, replacementDate: string,
  startTime: string, endTime: string, room: string | null,
  excludeRequestId?: string,
): Promise<void> {
  // A single offering/date has only one attendance register in the present
  // attendance model. Never let a replacement share that date with a normal meeting.
  const offer = await prisma.offering.findUnique({
    where: { id: offeringId },
    select: {
      meetings: { select: { dayOfWeek: true } },
      startDate: true, endDate: true,
      academicCalendarPeriod: { select: { teachingStart: true, teachingEnd: true } },
    },
  });
  if (!offer) throw new MakeUpClassNotFoundError("Course offering not found");
  const periodStart = offer.academicCalendarPeriod?.teachingStart ?? offer.startDate;
  const periodEnd = offer.academicCalendarPeriod?.teachingEnd ?? offer.endDate;
  if (!periodStart || !periodEnd ||
      replacementDate < dateOnly(periodStart) || replacementDate > dateOnly(periodEnd)) {
    throw new MakeUpClassValidationError("Replacement must be within the offering's teaching period");
  }
  const weekday = dayOf(replacementDate);
  if (offer.meetings.some((m) => m.dayOfWeek === weekday)) {
    throw new MakeUpClassConflictError("This offering already has a recurring class on that day; separate same-day registers are not yet supported");
  }
  const existingAttendance = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pms_attendance"."AttendanceSession"
    WHERE "offeringId" = ${offeringId} AND "sessionDate" = ${replacementDate}::date LIMIT 1
  `;
  if (existingAttendance.length) {
    throw new MakeUpClassConflictError("An attendance register already exists for this course and replacement date");
  }

  const recurring = await prisma.offeringMeeting.findMany({
    where: { dayOfWeek: weekday },
    select: {
      startTime: true, endTime: true, room: true,
      lecturers: { select: { lecturerId: true } },
      offering: {
        select: {
          lecturerId: true, startDate: true, endDate: true,
          coLecturers: { select: { lecturerId: true } },
          academicCalendarPeriod: { select: { teachingStart: true, teachingEnd: true } },
        },
      },
    },
  });
  for (const meeting of recurring) {
    const first = meeting.offering.academicCalendarPeriod?.teachingStart ?? meeting.offering.startDate;
    const last = meeting.offering.academicCalendarPeriod?.teachingEnd ?? meeting.offering.endDate;
    if (!first || !last || replacementDate < dateOnly(first) || replacementDate > dateOnly(last)) continue;
    if (!overlapping(startTime, endTime, meeting.startTime, meeting.endTime)) continue;
    const lecturerBooked =
      meeting.offering.lecturerId === proposerId ||
      meeting.offering.coLecturers.some((a) => a.lecturerId === proposerId) ||
      meeting.lecturers.some((a) => a.lecturerId === proposerId);
    const roomBooked = Boolean(room && meeting.room && room === meeting.room);
    if (lecturerBooked || roomBooked) {
      throw new MakeUpClassConflictError(lecturerBooked
        ? "The proposing lecturer has another timetable class at that time"
        : "The proposed room is already scheduled at that time");
    }
  }
  const active = await prisma.$queryRaw<Array<{
    id: string; startTime: string; endTime: string; room: string | null; proposedById: string;
  }>>`
    SELECT "id", "startTime", "endTime", "room", "proposedById"
    FROM "pms_attendance"."MakeUpClassRequest"
    WHERE "replacementDate" = ${replacementDate}::date
      AND "status" IN ('PENDING','APPROVED')
  `;
  for (const other of active) {
    if (other.id === excludeRequestId ||
        !overlapping(startTime, endTime, other.startTime, other.endTime)) continue;
    if (other.proposedById === proposerId || (room && other.room === room)) {
      throw new MakeUpClassConflictError("Conflicting pending or approved make-up time/room");
    }
  }
}

async function confirmOriginalNeedsRecovery(occurrenceId: string, offeringId: string, originalDate: string): Promise<void> {
  // Future classes are not missed teaching unless a leave request is already
  // approved for that exact original occurrence.
  const original = await prisma.$queryRaw<Array<{ approvedLeaveRequestId: string | null; scheduledEndTime: string }>>`
    SELECT "approvedLeaveRequestId", "scheduledEndTime"
    FROM "pms_attendance"."TeachingSessionOccurrence"
    WHERE "id" = ${occurrenceId} AND "offeringId" = ${offeringId} LIMIT 1
  `;
  if (!original[0]) throw new MakeUpClassNotFoundError("Original teaching occurrence no longer exists");
  if (!original[0].approvedLeaveRequestId &&
      new Date(`${originalDate}T${original[0].scheduledEndTime}:00+07:00`).getTime() > Date.now()) {
    throw new MakeUpClassConflictError("The original class has not ended and has no approved teaching leave");
  }
  const attendance = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pms_attendance"."AttendanceSession"
    WHERE "offeringId" = ${offeringId} AND "sessionDate" = ${originalDate}::date LIMIT 1
  `;
  if (attendance.length) throw new MakeUpClassConflictError("The original class already has attendance; resolve it before approving recovery");
  const delivered = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pms_attendance"."TeachingSessionDelivery"
    WHERE "occurrenceId" = ${occurrenceId} AND "classOccurred" = true LIMIT 1
  `;
  if (delivered.length) throw new MakeUpClassConflictError("The original session was recorded as delivered");
}

export const makeUpClassService = {
  async mine(user: AuthUser): Promise<MakeUpClassView[]> {
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      projection + ' WHERE r."proposedById" = $1 ORDER BY r."createdAt" DESC LIMIT 100',
      user.id,
    );
    return rows.map(toView);
  },

  async reviewQueue(user: AuthUser): Promise<MakeUpClassView[]> {
    if (!user.roles.some((role) => MANAGERS.includes(role as typeof MANAGERS[number]))) {
      throw new MakeUpClassForbiddenError("Programme reviewer permission required");
    }
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      projection + ' WHERE r."status" = \'PENDING\' ORDER BY r."createdAt" ASC LIMIT 200',
    );
    return rows.filter((row) => manager(user, row.programmeId) && row.proposedById !== user.id).map(toView);
  },

  async approvedForDate(user: AuthUser, date: string): Promise<ApprovedMakeUpAttendanceDate[]> {
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      projection + ' WHERE r."status" = \'APPROVED\' AND r."replacementDate" = $1::date ORDER BY r."startTime"',
      date,
    );
    const coTeachers = await prisma.offeringCoLecturer.findMany({
      where: { lecturerId: user.id, offeringId: { in: rows.map((row) => row.offeringId) } },
      select: { offeringId: true },
    });
    const coIds = new Set(coTeachers.map((row) => row.offeringId));
    return rows
      .filter((row) => row.lecturerId === user.id ||
        coIds.has(row.offeringId) || manager(user, row.programmeId))
      .map((row) => ({
        id: row.id, offeringId: row.offeringId,
        replacementDate: dateOnly(row.replacementDate), originalDate: dateOnly(row.originalDate),
        startTime: row.startTime, endTime: row.endTime, room: row.room,
      }));
  },

  async propose(user: AuthUser, input: ProposeMakeUpClass): Promise<MakeUpClassView> {
    const offering = await prisma.offering.findUnique({
      where: { id: input.offeringId },
      select: {
        lecturerId: true,
        coLecturers: { select: { lecturerId: true } },
        meetings: { where: { id: input.offeringMeetingId }, select: {
          id: true, room: true, lecturers: { select: { lecturerId: true } },
        } },
      },
    });
    if (!offering || offering.meetings.length !== 1) {
      throw new MakeUpClassNotFoundError("Teaching meeting not found in this offering");
    }
    const permitted = offering.lecturerId === user.id ||
      offering.coLecturers.some((item) => item.lecturerId === user.id) ||
      offering.meetings[0]!.lecturers.some((item) => item.lecturerId === user.id);
    if (!permitted) throw new MakeUpClassForbiddenError("Only an assigned lecturer can propose a make-up");
    const original = await classDeliveryService.resolveTeachingSessionOccurrence(
      input.offeringId, input.offeringMeetingId, input.originalDate,
    );
    const room = input.room?.trim() || offering.meetings[0]!.room || null;
    await activeDateConflict(input.offeringId, user.id, input.replacementDate, input.startTime, input.endTime, room);
    const id = randomUUID();
    try {
      await prisma.$executeRaw`
        INSERT INTO "pms_attendance"."MakeUpClassRequest" (
          "id","offeringId","originalOccurrenceId","replacementDate",
          "startTime","endTime","room","note","proposedById"
        ) VALUES (
          ${id},${input.offeringId},${original.id},${input.replacementDate}::date,
          ${input.startTime},${input.endTime},${room},${input.note},${user.id}
        )
      `;
    } catch (error) {
      if (String(error).includes("unique") || String(error).includes("23505")) {
        throw new MakeUpClassConflictError("This original class or replacement date already has an active request");
      }
      throw error;
    }
    return toView(await byId(id));
  },

  async review(user: AuthUser, id: string, input: ReviewMakeUpClass): Promise<MakeUpClassView> {
    const request = await byId(id);
    if (!manager(user, request.programmeId) || request.proposedById === user.id) {
      throw new MakeUpClassForbiddenError("Only another authorized programme reviewer can decide this request");
    }
    if (request.status !== "PENDING") throw new MakeUpClassConflictError("This request has already been reviewed");
    if (input.decision === "APPROVE") {
      await confirmOriginalNeedsRecovery(request.originalOccurrenceId, request.offeringId, dateOnly(request.originalDate));
      await activeDateConflict(
        request.offeringId, request.proposedById,
        dateOnly(request.replacementDate), request.startTime, request.endTime, request.room,
        request.id,
      );
    }
    const changed = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "pms_attendance"."MakeUpClassRequest"
      SET "status" = ${input.decision === "APPROVE" ? "APPROVED" : "REJECTED"},
          "reviewedById" = ${user.id}, "reviewedAt" = CURRENT_TIMESTAMP,
          "reviewNote" = ${input.note ?? ""}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "status" = 'PENDING'
      RETURNING "id"
    `;
    if (changed.length !== 1) throw new MakeUpClassConflictError("Request changed during review");
    return toView(await byId(id));
  },
};
