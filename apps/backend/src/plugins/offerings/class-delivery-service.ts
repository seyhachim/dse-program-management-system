import { randomUUID } from "node:crypto";
import type {
  ClassSessionStatus,
  ClassSessionStatusView,
  LecturerArrivalConfirmationView,
  LecturerArrivalStatus,
  MeetingActivityType,
  MeetingDay,
  SaveClassSessionStatusResult,
  SaveLecturerArrivalConfirmationResult,
  TeachingSessionOccurrenceView,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

interface ArrivalRow {
  id: string;
  offeringId: string;
  date: Date;
  status: LecturerArrivalStatus;
  note: string;
  recordedById: string;
  recordedByName: string;
  recordedAt: Date;
  updatedAt: Date;
}

interface SessionRow {
  id: string;
  offeringId: string;
  date: Date;
  status: ClassSessionStatus;
  reason: string;
  recordedById: string;
  recordedByName: string;
  recordedAt: Date;
  updatedAt: Date;
}

interface OfferingMeetingRow {
  id: string;
  offeringId: string;
  dayOfWeek: MeetingDay;
  startTime: string;
  endTime: string;
  room: string | null;
  activityType: MeetingActivityType;
  teachingStart: Date | null;
  teachingEnd: Date | null;
  legacyStartDate: Date | null;
  legacyEndDate: Date | null;
}

interface OccurrenceRow {
  id: string;
  offeringId: string;
  offeringMeetingId: string;
  sessionDate: Date;
  scheduledDayOfWeek: MeetingDay;
  scheduledStartTime: string;
  scheduledEndTime: string;
  scheduledRoom: string | null;
  scheduledActivityType: MeetingActivityType;
  createdAt: Date;
  updatedAt: Date;
}

interface LegacyAddressingCounts {
  meetingCount: bigint;
  occurrenceCount: bigint;
}

export class TeachingSessionOccurrenceReferenceError extends Error {}
export class TeachingSessionOccurrenceValidationError extends Error {}

const WEEK_DAYS: MeetingDay[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || dateOnly(parsed) !== value) {
    throw new TeachingSessionOccurrenceValidationError("Use a valid YYYY-MM-DD session date");
  }
  return parsed;
}

function dayForDate(value: string): MeetingDay {
  const parsed = parseDateOnly(value);
  return WEEK_DAYS[parsed.getUTCDay()]!;
}

function arrivalView(row: ArrivalRow): LecturerArrivalConfirmationView {
  return {
    id: row.id,
    offeringId: row.offeringId,
    date: dateOnly(row.date),
    status: row.status,
    note: row.note,
    recordedBy: { id: row.recordedById, name: row.recordedByName },
    recordedAt: row.recordedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sessionView(row: SessionRow): ClassSessionStatusView {
  return {
    id: row.id,
    offeringId: row.offeringId,
    date: dateOnly(row.date),
    status: row.status,
    reason: row.reason,
    recordedBy: { id: row.recordedById, name: row.recordedByName },
    recordedAt: row.recordedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function occurrenceView(row: OccurrenceRow): TeachingSessionOccurrenceView {
  return {
    id: row.id,
    offeringId: row.offeringId,
    offeringMeetingId: row.offeringMeetingId,
    date: dateOnly(row.sessionDate),
    scheduledDayOfWeek: row.scheduledDayOfWeek,
    scheduledStartTime: row.scheduledStartTime,
    scheduledEndTime: row.scheduledEndTime,
    scheduledRoom: row.scheduledRoom,
    scheduledActivityType: row.scheduledActivityType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertLegacyEvidenceAddressable<T>(rows: T[]): T | undefined {
  if (rows.length > 1) {
    throw new TeachingSessionOccurrenceValidationError(
      "Multiple class meetings exist for this offering/date; use an exact teaching session occurrence",
    );
  }
  return rows[0];
}

function assertLegacyScheduleCounts(counts: LegacyAddressingCounts | undefined): void {
  if (Number(counts?.meetingCount ?? 0n) > 1 || Number(counts?.occurrenceCount ?? 0n) > 1) {
    throw new TeachingSessionOccurrenceValidationError(
      "Multiple class meetings exist for this offering/date; use an exact teaching session occurrence",
    );
  }
}

async function assertLegacyScheduleAddressable(offeringId: string, date: string): Promise<void> {
  const dayOfWeek = dayForDate(date);
  const counts = await prisma.$queryRaw<LegacyAddressingCounts[]>`
    SELECT
      (
        SELECT COUNT(*)::bigint
        FROM "OfferingMeeting"
        WHERE "offeringId" = ${offeringId}
          AND "dayOfWeek" = ${dayOfWeek}
      ) AS "meetingCount",
      (
        SELECT COUNT(*)::bigint
        FROM "pms_attendance"."TeachingSessionOccurrence"
        WHERE "offeringId" = ${offeringId}
          AND "sessionDate" = ${date}::date
      ) AS "occurrenceCount"
  `;
  assertLegacyScheduleCounts(counts[0]);
}

async function readArrivalRow(offeringId: string, date: string): Promise<ArrivalRow | null> {
  await assertLegacyScheduleAddressable(offeringId, date);
  const rows = await prisma.$queryRaw<ArrivalRow[]>`
    SELECT
      c."id", c."offeringId", c."date", c."status", c."note", c."recordedById",
      u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
    FROM "pms_attendance"."LecturerArrivalConfirmation" c
    JOIN "User" u ON u."id" = c."recordedById"
    WHERE c."offeringId" = ${offeringId}
      AND c."date" = ${date}::date
    ORDER BY c."recordedAt" ASC
  `;
  return assertLegacyEvidenceAddressable(rows) ?? null;
}

async function readSessionRow(offeringId: string, date: string): Promise<SessionRow | null> {
  await assertLegacyScheduleAddressable(offeringId, date);
  const rows = await prisma.$queryRaw<SessionRow[]>`
    SELECT
      s."id", s."offeringId", s."date", s."status", s."reason", s."recordedById",
      u."name" AS "recordedByName", s."recordedAt", s."updatedAt"
    FROM "pms_attendance"."ClassSessionStatus" s
    JOIN "User" u ON u."id" = s."recordedById"
    WHERE s."offeringId" = ${offeringId}
      AND s."date" = ${date}::date
    ORDER BY s."recordedAt" ASC
  `;
  return assertLegacyEvidenceAddressable(rows) ?? null;
}

async function readOccurrenceRow(
  offeringId: string,
  offeringMeetingId: string,
  date: string,
): Promise<OccurrenceRow | null> {
  parseDateOnly(date);
  const rows = await prisma.$queryRaw<OccurrenceRow[]>`
    SELECT
      "id", "offeringId", "offeringMeetingId", "sessionDate", "scheduledDayOfWeek",
      "scheduledStartTime", "scheduledEndTime", "scheduledRoom", "scheduledActivityType",
      "createdAt", "updatedAt"
    FROM "pms_attendance"."TeachingSessionOccurrence"
    WHERE "offeringId" = ${offeringId}
      AND "offeringMeetingId" = ${offeringMeetingId}
      AND "sessionDate" = ${date}::date
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function validateOccurrenceDate(meeting: OfferingMeetingRow, date: string): void {
  const actualDay = dayForDate(date);
  if (actualDay !== meeting.dayOfWeek) {
    throw new TeachingSessionOccurrenceValidationError(
      `Session date is ${actualDay}; this meeting is scheduled for ${meeting.dayOfWeek}`,
    );
  }

  const periodStart = meeting.teachingStart ?? meeting.legacyStartDate;
  const periodEnd = meeting.teachingEnd ?? meeting.legacyEndDate;
  if (!periodStart || !periodEnd) {
    throw new TeachingSessionOccurrenceValidationError("Offering has no usable teaching period");
  }
  if (date < dateOnly(periodStart) || date > dateOnly(periodEnd)) {
    throw new TeachingSessionOccurrenceValidationError("Session date is outside the offering teaching period");
  }
}

async function readArrivalForOccurrence(occurrenceId: string): Promise<ArrivalRow | null> {
  const rows = await prisma.$queryRaw<ArrivalRow[]>`
    SELECT
      c."id", c."offeringId", c."date", c."status", c."note", c."recordedById",
      u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
    FROM "pms_attendance"."LecturerArrivalConfirmation" c
    JOIN "User" u ON u."id" = c."recordedById"
    WHERE c."occurrenceId" = ${occurrenceId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function readSessionForOccurrence(occurrenceId: string): Promise<SessionRow | null> {
  const rows = await prisma.$queryRaw<SessionRow[]>`
    SELECT
      s."id", s."offeringId", s."date", s."status", s."reason", s."recordedById",
      u."name" AS "recordedByName", s."recordedAt", s."updatedAt"
    FROM "pms_attendance"."ClassSessionStatus" s
    JOIN "User" u ON u."id" = s."recordedById"
    WHERE s."occurrenceId" = ${occurrenceId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export const classDeliveryService = {
  async getTeachingSessionOccurrence(
    offeringId: string,
    offeringMeetingId: string,
    date: string,
  ): Promise<TeachingSessionOccurrenceView | null> {
    const row = await readOccurrenceRow(offeringId, offeringMeetingId, date);
    return row ? occurrenceView(row) : null;
  },

  async resolveTeachingSessionOccurrence(
    offeringId: string,
    offeringMeetingId: string,
    date: string,
  ): Promise<TeachingSessionOccurrenceView> {
    parseDateOnly(date);
    return prisma.$transaction(async (tx) => {
      // Historical occurrences are immutable schedule snapshots. Return one before
      // consulting today's live timetable/period so later legitimate schedule edits
      // cannot make an already materialized occurrence unreadable.
      const existing = await tx.$queryRaw<OccurrenceRow[]>`
        SELECT
          "id", "offeringId", "offeringMeetingId", "sessionDate", "scheduledDayOfWeek",
          "scheduledStartTime", "scheduledEndTime", "scheduledRoom", "scheduledActivityType",
          "createdAt", "updatedAt"
        FROM "pms_attendance"."TeachingSessionOccurrence"
        WHERE "offeringId" = ${offeringId}
          AND "offeringMeetingId" = ${offeringMeetingId}
          AND "sessionDate" = ${date}::date
        FOR UPDATE
      `;
      if (existing[0]) return occurrenceView(existing[0]);

      const meetings = await tx.$queryRaw<OfferingMeetingRow[]>`
        SELECT
          m."id", m."offeringId", m."dayOfWeek", m."startTime", m."endTime", m."room", m."activityType",
          p."teachingStart", p."teachingEnd",
          o."startDate" AS "legacyStartDate", o."endDate" AS "legacyEndDate"
        FROM "OfferingMeeting" m
        JOIN "Offering" o ON o."id" = m."offeringId"
        LEFT JOIN "AcademicCalendarPeriod" p ON p."id" = o."academicCalendarPeriodId"
        WHERE m."id" = ${offeringMeetingId}
          AND m."offeringId" = ${offeringId}
        FOR SHARE OF m, o
      `;
      const meeting = meetings[0];
      if (!meeting) {
        throw new TeachingSessionOccurrenceReferenceError("Offering meeting not found for this offering");
      }
      validateOccurrenceDate(meeting, date);

      const now = new Date();
      const inserted = await tx.$queryRaw<OccurrenceRow[]>`
        INSERT INTO "pms_attendance"."TeachingSessionOccurrence" (
          "id", "offeringId", "offeringMeetingId", "sessionDate", "scheduledDayOfWeek",
          "scheduledStartTime", "scheduledEndTime", "scheduledRoom", "scheduledActivityType",
          "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${offeringId}, ${offeringMeetingId}, ${date}::date, ${meeting.dayOfWeek},
          ${meeting.startTime}, ${meeting.endTime}, ${meeting.room}, ${meeting.activityType},
          ${now}, ${now}
        )
        ON CONFLICT ("offeringMeetingId", "sessionDate") DO NOTHING
        RETURNING
          "id", "offeringId", "offeringMeetingId", "sessionDate", "scheduledDayOfWeek",
          "scheduledStartTime", "scheduledEndTime", "scheduledRoom", "scheduledActivityType",
          "createdAt", "updatedAt"
      `;
      let row = inserted[0];
      if (!row) {
        const concurrent = await tx.$queryRaw<OccurrenceRow[]>`
          SELECT
            "id", "offeringId", "offeringMeetingId", "sessionDate", "scheduledDayOfWeek",
            "scheduledStartTime", "scheduledEndTime", "scheduledRoom", "scheduledActivityType",
            "createdAt", "updatedAt"
          FROM "pms_attendance"."TeachingSessionOccurrence"
          WHERE "offeringId" = ${offeringId}
            AND "offeringMeetingId" = ${offeringMeetingId}
            AND "sessionDate" = ${date}::date
        `;
        row = concurrent[0];
      }
      if (!row) throw new Error("Teaching session occurrence was not persisted");

      // Link legacy Offering+date evidence only when exactly one recurring meeting
      // exists on this weekday. Multiple same-day meetings stay unresolved.
      const matchingMeetings = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "OfferingMeeting"
        WHERE "offeringId" = ${offeringId}
          AND "dayOfWeek" = ${meeting.dayOfWeek}
      `;
      if (Number(matchingMeetings[0]?.count ?? 0n) === 1) {
        await tx.$executeRaw`
          UPDATE "pms_attendance"."LecturerArrivalConfirmation"
          SET "occurrenceId" = ${row.id}
          WHERE "offeringId" = ${offeringId}
            AND "date" = ${date}::date
            AND "occurrenceId" IS NULL
        `;
        await tx.$executeRaw`
          UPDATE "pms_attendance"."ClassSessionStatus"
          SET "occurrenceId" = ${row.id}
          WHERE "offeringId" = ${offeringId}
            AND "date" = ${date}::date
            AND "occurrenceId" IS NULL
        `;
      }

      return occurrenceView(row);
    });
  },

  async getLecturerArrival(offeringId: string, date: string): Promise<LecturerArrivalConfirmationView | null> {
    const row = await readArrivalRow(offeringId, date);
    return row ? arrivalView(row) : null;
  },

  async getLecturerArrivalForOccurrence(
    occurrenceId: string,
  ): Promise<LecturerArrivalConfirmationView | null> {
    const row = await readArrivalForOccurrence(occurrenceId);
    return row ? arrivalView(row) : null;
  },

  async getClassSessionStatus(offeringId: string, date: string): Promise<ClassSessionStatusView | null> {
    const row = await readSessionRow(offeringId, date);
    return row ? sessionView(row) : null;
  },

  async getClassSessionStatusForOccurrence(occurrenceId: string): Promise<ClassSessionStatusView | null> {
    const row = await readSessionForOccurrence(occurrenceId);
    return row ? sessionView(row) : null;
  },

  async saveLecturerArrival(
    offeringId: string,
    date: string,
    status: LecturerArrivalStatus,
    note: string,
    actorId: string,
  ): Promise<SaveLecturerArrivalConfirmationResult> {
    const result = await prisma.$transaction(async (tx) => {
      const offerings = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE
      `;
      if (!offerings[0]) throw new ReferenceError("Offering not found");

      const dayOfWeek = dayForDate(date);
      const counts = await tx.$queryRaw<LegacyAddressingCounts[]>`
        SELECT
          (
            SELECT COUNT(*)::bigint FROM "OfferingMeeting"
            WHERE "offeringId" = ${offeringId} AND "dayOfWeek" = ${dayOfWeek}
          ) AS "meetingCount",
          (
            SELECT COUNT(*)::bigint FROM "pms_attendance"."TeachingSessionOccurrence"
            WHERE "offeringId" = ${offeringId} AND "sessionDate" = ${date}::date
          ) AS "occurrenceCount"
      `;
      assertLegacyScheduleCounts(counts[0]);

      const existing = await tx.$queryRaw<ArrivalRow[]>`
        SELECT
          c."id", c."offeringId", c."date", c."status", c."note", c."recordedById",
          u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
        FROM "pms_attendance"."LecturerArrivalConfirmation" c
        JOIN "User" u ON u."id" = c."recordedById"
        WHERE c."offeringId" = ${offeringId} AND c."date" = ${date}::date
        ORDER BY c."recordedAt" ASC
        FOR UPDATE OF c
      `;
      const current = assertLegacyEvidenceAddressable(existing);
      if (current?.status === status && current.note === note) return { row: current, changed: false };

      const now = new Date();
      const rows = current
        ? await tx.$queryRaw<ArrivalRow[]>`
            UPDATE "pms_attendance"."LecturerArrivalConfirmation" c
            SET "status" = ${status}, "note" = ${note}, "recordedById" = ${actorId},
                "recordedAt" = ${now}, "updatedAt" = ${now}
            FROM "User" u
            WHERE c."id" = ${current.id} AND u."id" = ${actorId}
            RETURNING
              c."id", c."offeringId", c."date", c."status", c."note", c."recordedById",
              u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
          `
        : await tx.$queryRaw<ArrivalRow[]>`
            WITH inserted AS (
              INSERT INTO "pms_attendance"."LecturerArrivalConfirmation" (
                "id", "offeringId", "date", "status", "note", "recordedById", "recordedAt", "updatedAt"
              ) VALUES (${randomUUID()}, ${offeringId}, ${date}::date, ${status}, ${note}, ${actorId}, ${now}, ${now})
              RETURNING *
            )
            SELECT
              i."id", i."offeringId", i."date", i."status", i."note", i."recordedById",
              u."name" AS "recordedByName", i."recordedAt", i."updatedAt"
            FROM inserted i JOIN "User" u ON u."id" = i."recordedById"
          `;
      if (!rows[0]) throw new Error("Lecturer arrival confirmation was not persisted");
      return { row: rows[0], changed: true };
    });
    return { confirmation: arrivalView(result.row), changed: result.changed };
  },

  async saveLecturerArrivalForOccurrence(
    occurrenceId: string,
    status: LecturerArrivalStatus,
    note: string,
    actorId: string,
  ): Promise<SaveLecturerArrivalConfirmationResult> {
    const result = await prisma.$transaction(async (tx) => {
      const occurrences = await tx.$queryRaw<Array<{ id: string; offeringId: string; sessionDate: Date }>>`
        SELECT "id", "offeringId", "sessionDate"
        FROM "pms_attendance"."TeachingSessionOccurrence"
        WHERE "id" = ${occurrenceId}
        FOR UPDATE
      `;
      const occurrence = occurrences[0];
      if (!occurrence) throw new TeachingSessionOccurrenceReferenceError("Teaching session occurrence not found");

      const existing = await tx.$queryRaw<ArrivalRow[]>`
        SELECT
          c."id", c."offeringId", c."date", c."status", c."note", c."recordedById",
          u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
        FROM "pms_attendance"."LecturerArrivalConfirmation" c
        JOIN "User" u ON u."id" = c."recordedById"
        WHERE c."occurrenceId" = ${occurrenceId}
        FOR UPDATE OF c
      `;
      const current = existing[0];
      if (current?.status === status && current.note === note) return { row: current, changed: false };

      const now = new Date();
      const rows = current
        ? await tx.$queryRaw<ArrivalRow[]>`
            UPDATE "pms_attendance"."LecturerArrivalConfirmation" c
            SET "status" = ${status}, "note" = ${note}, "recordedById" = ${actorId},
                "recordedAt" = ${now}, "updatedAt" = ${now}
            FROM "User" u
            WHERE c."id" = ${current.id} AND u."id" = ${actorId}
            RETURNING
              c."id", c."offeringId", c."date", c."status", c."note", c."recordedById",
              u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
          `
        : await tx.$queryRaw<ArrivalRow[]>`
            WITH inserted AS (
              INSERT INTO "pms_attendance"."LecturerArrivalConfirmation" (
                "id", "offeringId", "date", "occurrenceId", "status", "note", "recordedById", "recordedAt", "updatedAt"
              ) VALUES (
                ${randomUUID()}, ${occurrence.offeringId}, ${occurrence.sessionDate}, ${occurrenceId},
                ${status}, ${note}, ${actorId}, ${now}, ${now}
              )
              RETURNING *
            )
            SELECT
              i."id", i."offeringId", i."date", i."status", i."note", i."recordedById",
              u."name" AS "recordedByName", i."recordedAt", i."updatedAt"
            FROM inserted i JOIN "User" u ON u."id" = i."recordedById"
          `;
      if (!rows[0]) throw new Error("Lecturer arrival confirmation was not persisted");
      return { row: rows[0], changed: true };
    });
    return { confirmation: arrivalView(result.row), changed: result.changed };
  },

  async saveClassSessionStatus(
    offeringId: string,
    date: string,
    status: ClassSessionStatus,
    reason: string,
    actorId: string,
  ): Promise<SaveClassSessionStatusResult> {
    const result = await prisma.$transaction(async (tx) => {
      const offerings = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE
      `;
      if (!offerings[0]) throw new ReferenceError("Offering not found");

      const dayOfWeek = dayForDate(date);
      const counts = await tx.$queryRaw<LegacyAddressingCounts[]>`
        SELECT
          (
            SELECT COUNT(*)::bigint FROM "OfferingMeeting"
            WHERE "offeringId" = ${offeringId} AND "dayOfWeek" = ${dayOfWeek}
          ) AS "meetingCount",
          (
            SELECT COUNT(*)::bigint FROM "pms_attendance"."TeachingSessionOccurrence"
            WHERE "offeringId" = ${offeringId} AND "sessionDate" = ${date}::date
          ) AS "occurrenceCount"
      `;
      assertLegacyScheduleCounts(counts[0]);

      const existing = await tx.$queryRaw<SessionRow[]>`
        SELECT
          s."id", s."offeringId", s."date", s."status", s."reason", s."recordedById",
          u."name" AS "recordedByName", s."recordedAt", s."updatedAt"
        FROM "pms_attendance"."ClassSessionStatus" s
        JOIN "User" u ON u."id" = s."recordedById"
        WHERE s."offeringId" = ${offeringId} AND s."date" = ${date}::date
        ORDER BY s."recordedAt" ASC
        FOR UPDATE OF s
      `;
      const current = assertLegacyEvidenceAddressable(existing);
      if (current?.status === status && current.reason === reason) return { row: current, changed: false };

      const now = new Date();
      const rows = current
        ? await tx.$queryRaw<SessionRow[]>`
            UPDATE "pms_attendance"."ClassSessionStatus" s
            SET "status" = ${status}, "reason" = ${reason}, "recordedById" = ${actorId},
                "recordedAt" = ${now}, "updatedAt" = ${now}
            FROM "User" u
            WHERE s."id" = ${current.id} AND u."id" = ${actorId}
            RETURNING
              s."id", s."offeringId", s."date", s."status", s."reason", s."recordedById",
              u."name" AS "recordedByName", s."recordedAt", s."updatedAt"
          `
        : await tx.$queryRaw<SessionRow[]>`
            WITH inserted AS (
              INSERT INTO "pms_attendance"."ClassSessionStatus" (
                "id", "offeringId", "date", "status", "reason", "recordedById", "recordedAt", "updatedAt"
              ) VALUES (${randomUUID()}, ${offeringId}, ${date}::date, ${status}, ${reason}, ${actorId}, ${now}, ${now})
              RETURNING *
            )
            SELECT
              i."id", i."offeringId", i."date", i."status", i."reason", i."recordedById",
              u."name" AS "recordedByName", i."recordedAt", i."updatedAt"
            FROM inserted i JOIN "User" u ON u."id" = i."recordedById"
          `;
      if (!rows[0]) throw new Error("Class session status was not persisted");
      return { row: rows[0], changed: true };
    });
    return { session: sessionView(result.row), changed: result.changed };
  },

  async saveClassSessionStatusForOccurrence(
    occurrenceId: string,
    status: ClassSessionStatus,
    reason: string,
    actorId: string,
  ): Promise<SaveClassSessionStatusResult> {
    const result = await prisma.$transaction(async (tx) => {
      const occurrences = await tx.$queryRaw<Array<{ id: string; offeringId: string; sessionDate: Date }>>`
        SELECT "id", "offeringId", "sessionDate"
        FROM "pms_attendance"."TeachingSessionOccurrence"
        WHERE "id" = ${occurrenceId}
        FOR UPDATE
      `;
      const occurrence = occurrences[0];
      if (!occurrence) throw new TeachingSessionOccurrenceReferenceError("Teaching session occurrence not found");

      const existing = await tx.$queryRaw<SessionRow[]>`
        SELECT
          s."id", s."offeringId", s."date", s."status", s."reason", s."recordedById",
          u."name" AS "recordedByName", s."recordedAt", s."updatedAt"
        FROM "pms_attendance"."ClassSessionStatus" s
        JOIN "User" u ON u."id" = s."recordedById"
        WHERE s."occurrenceId" = ${occurrenceId}
        FOR UPDATE OF s
      `;
      const current = existing[0];
      if (current?.status === status && current.reason === reason) return { row: current, changed: false };

      const now = new Date();
      const rows = current
        ? await tx.$queryRaw<SessionRow[]>`
            UPDATE "pms_attendance"."ClassSessionStatus" s
            SET "status" = ${status}, "reason" = ${reason}, "recordedById" = ${actorId},
                "recordedAt" = ${now}, "updatedAt" = ${now}
            FROM "User" u
            WHERE s."id" = ${current.id} AND u."id" = ${actorId}
            RETURNING
              s."id", s."offeringId", s."date", s."status", s."reason", s."recordedById",
              u."name" AS "recordedByName", s."recordedAt", s."updatedAt"
          `
        : await tx.$queryRaw<SessionRow[]>`
            WITH inserted AS (
              INSERT INTO "pms_attendance"."ClassSessionStatus" (
                "id", "offeringId", "date", "occurrenceId", "status", "reason", "recordedById", "recordedAt", "updatedAt"
              ) VALUES (
                ${randomUUID()}, ${occurrence.offeringId}, ${occurrence.sessionDate}, ${occurrenceId},
                ${status}, ${reason}, ${actorId}, ${now}, ${now}
              )
              RETURNING *
            )
            SELECT
              i."id", i."offeringId", i."date", i."status", i."reason", i."recordedById",
              u."name" AS "recordedByName", i."recordedAt", i."updatedAt"
            FROM inserted i JOIN "User" u ON u."id" = i."recordedById"
          `;
      if (!rows[0]) throw new Error("Class session status was not persisted");
      return { row: rows[0], changed: true };
    });
    return { session: sessionView(result.row), changed: result.changed };
  },
};

export type ClassDeliveryService = typeof classDeliveryService;
