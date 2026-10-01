import { randomUUID } from "node:crypto";
import {
  TEACHING_START_EARLY_WINDOW_MINUTES,
  TEACHING_TIMING_MIN_DURATION_SECONDS,
  type SaveTeachingSessionTimingResult,
  type TeachingSessionTimingView,
} from "@dse-pms/shared-types";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import {
  TeachingSessionOccurrenceReferenceError,
  classDeliveryService,
} from "./class-delivery-service.ts";
import {
  ClassResponsibilityEligibilityError,
  classResponsibilityService,
} from "./class-responsibility-service.ts";

export class TeachingSessionTimingReferenceError extends Error {}
export class TeachingSessionTimingValidationError extends Error {}

interface ExactOccurrenceRow {
  id: string;
  offeringId: string;
  sessionDate: Date;
  scheduledStartTime: string;
  scheduledEndTime: string;
}

interface TimingRow {
  occurrenceId: string;
  offeringId: string;
  startedAt: Date | null;
  startedById: string | null;
  startedByName: string | null;
  endedAt: Date | null;
  endedById: string | null;
  endedByName: string | null;
}

function timingView(row: TimingRow): TeachingSessionTimingView {
  return {
    occurrenceId: row.occurrenceId,
    offeringId: row.offeringId,
    startedAt: row.startedAt?.toISOString() ?? null,
    startedBy:
      row.startedById && row.startedByName
        ? { id: row.startedById, name: row.startedByName }
        : null,
    endedAt: row.endedAt?.toISOString() ?? null,
    endedBy:
      row.endedById && row.endedByName
        ? { id: row.endedById, name: row.endedByName }
        : null,
  };
}

function occurrenceInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+07:00`);
}

function occurrenceDayEnd(date: string): Date {
  return new Date(`${date}T23:59:59.999+07:00`);
}

function assertStartWindow(occurrence: ExactOccurrenceRow, now: Date): void {
  const date = occurrence.sessionDate.toISOString().slice(0, 10);
  const scheduledStart = occurrenceInstant(date, occurrence.scheduledStartTime);
  const scheduledEnd = occurrenceInstant(date, occurrence.scheduledEndTime);
  const opensAt = new Date(
    scheduledStart.getTime() - TEACHING_START_EARLY_WINDOW_MINUTES * 60_000,
  );

  if (now < opensAt) {
    throw new TeachingSessionTimingValidationError(
      `Teaching start can be recorded from ${TEACHING_START_EARLY_WINDOW_MINUTES} minutes before the scheduled start`,
    );
  }
  if (now > scheduledEnd) {
    throw new TeachingSessionTimingValidationError(
      "Teaching start can no longer be recorded after the scheduled class end",
    );
  }
}

function assertEndWindow(
  occurrence: ExactOccurrenceRow,
  startedAt: Date,
  now: Date,
): void {
  const date = occurrence.sessionDate.toISOString().slice(0, 10);
  const earliestEnd = new Date(
    startedAt.getTime() + TEACHING_TIMING_MIN_DURATION_SECONDS * 1000,
  );
  if (now < earliestEnd) {
    throw new TeachingSessionTimingValidationError(
      "Teaching end can be recorded at least one minute after teaching start",
    );
  }
  if (now > occurrenceDayEnd(date)) {
    throw new TeachingSessionTimingValidationError(
      "Teaching end can only be recorded on the teaching-session date",
    );
  }
}

async function assertActiveMonitorInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  offeringId: string,
): Promise<void> {
  const assignments = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT a."id"
    FROM "ClassResponsibilityAssignment" a
    JOIN "Student" s ON s."id" = a."studentId"
    JOIN "Enrollment" en
      ON en."studentId" = s."id" AND en."offeringId" = a."offeringId"
    WHERE s."userId" = ${userId}
      AND s."status" = 'Active'::"StudentStatus"
      AND a."offeringId" = ${offeringId}
      AND a."revokedAt" IS NULL
      AND a."role" IN (
        'ClassMonitor'::"ClassResponsibilityRole",
        'SubClassMonitor'::"ClassResponsibilityRole"
      )
    FOR SHARE OF a, s, en
    LIMIT 1
  `;
  if (!assignments[0]) {
    throw new ClassResponsibilityEligibilityError(
      "You are not an active class monitor for this offering",
    );
  }
}

async function readTimingWithClient(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
  occurrenceId: string,
  forUpdate = false,
): Promise<TimingRow | null> {
  const rows = forUpdate
    ? await client.$queryRaw<TimingRow[]>`
        SELECT
          t."occurrenceId", t."offeringId",
          t."startedAt", t."startedById", starter."name" AS "startedByName",
          t."endedAt", t."endedById", ender."name" AS "endedByName"
        FROM "pms_attendance"."TeachingSessionTiming" t
        LEFT JOIN "User" starter ON starter."id" = t."startedById"
        LEFT JOIN "User" ender ON ender."id" = t."endedById"
        WHERE t."occurrenceId" = ${occurrenceId}
        FOR UPDATE OF t
      `
    : await client.$queryRaw<TimingRow[]>`
        SELECT
          t."occurrenceId", t."offeringId",
          t."startedAt", t."startedById", starter."name" AS "startedByName",
          t."endedAt", t."endedById", ender."name" AS "endedByName"
        FROM "pms_attendance"."TeachingSessionTiming" t
        LEFT JOIN "User" starter ON starter."id" = t."startedById"
        LEFT JOIN "User" ender ON ender."id" = t."endedById"
        WHERE t."occurrenceId" = ${occurrenceId}
        LIMIT 1
      `;
  return rows[0] ?? null;
}

async function exactOccurrenceInTransaction(
  tx: Prisma.TransactionClient,
  occurrenceId: string,
  offeringId: string,
): Promise<ExactOccurrenceRow> {
  const rows = await tx.$queryRaw<ExactOccurrenceRow[]>`
    SELECT "id", "offeringId", "sessionDate", "scheduledStartTime", "scheduledEndTime"
    FROM "pms_attendance"."TeachingSessionOccurrence"
    WHERE "id" = ${occurrenceId}
      AND "offeringId" = ${offeringId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) {
    throw new TeachingSessionOccurrenceReferenceError(
      "Teaching session occurrence not found",
    );
  }
  return row;
}

export const monitorTeachingTimingService = {
  async getTiming(occurrenceId: string): Promise<TeachingSessionTimingView | null> {
    const row = await readTimingWithClient(prisma, occurrenceId);
    return row ? timingView(row) : null;
  },

  async markStarted(
    offeringId: string,
    meetingId: string,
    date: string,
    userId: string,
  ): Promise<SaveTeachingSessionTimingResult> {
    await classResponsibilityService.assertActiveForUser(userId, offeringId);
    const occurrence = await classDeliveryService.resolveTeachingSessionOccurrence(
      offeringId,
      meetingId,
      date,
    );

    const result = await prisma.$transaction(async (tx) => {
      const exactOccurrence = await exactOccurrenceInTransaction(
        tx,
        occurrence.id,
        offeringId,
      );
      await assertActiveMonitorInTransaction(tx, userId, offeringId);

      const current = await readTimingWithClient(tx, occurrence.id, true);
      if (current?.startedAt) {
        return { row: current, changed: false };
      }

      const now = new Date();
      assertStartWindow(exactOccurrence, now);

      const rows = current
        ? await tx.$queryRaw<TimingRow[]>`
            WITH updated AS (
              UPDATE "pms_attendance"."TeachingSessionTiming"
              SET
                "startedAt" = ${now},
                "startedById" = ${userId},
                "updatedAt" = ${now}
              WHERE "occurrenceId" = ${occurrence.id}
              RETURNING *
            )
            SELECT
              t."occurrenceId", t."offeringId",
              t."startedAt", t."startedById", starter."name" AS "startedByName",
              t."endedAt", t."endedById", ender."name" AS "endedByName"
            FROM updated t
            LEFT JOIN "User" starter ON starter."id" = t."startedById"
            LEFT JOIN "User" ender ON ender."id" = t."endedById"
          `
        : await tx.$queryRaw<TimingRow[]>`
            WITH inserted AS (
              INSERT INTO "pms_attendance"."TeachingSessionTiming" (
                "id", "occurrenceId", "offeringId",
                "startedAt", "startedById", "createdAt", "updatedAt"
              ) VALUES (
                ${randomUUID()}, ${occurrence.id}, ${offeringId},
                ${now}, ${userId}, ${now}, ${now}
              )
              RETURNING *
            )
            SELECT
              t."occurrenceId", t."offeringId",
              t."startedAt", t."startedById", starter."name" AS "startedByName",
              t."endedAt", t."endedById", ender."name" AS "endedByName"
            FROM inserted t
            LEFT JOIN "User" starter ON starter."id" = t."startedById"
            LEFT JOIN "User" ender ON ender."id" = t."endedById"
          `;

      if (!rows[0]) {
        throw new TeachingSessionTimingReferenceError(
          "Teaching start timestamp was not persisted",
        );
      }
      return { row: rows[0], changed: true };
    });

    return { timing: timingView(result.row), changed: result.changed };
  },

  async markEnded(
    offeringId: string,
    meetingId: string,
    date: string,
    userId: string,
  ): Promise<SaveTeachingSessionTimingResult> {
    await classResponsibilityService.assertActiveForUser(userId, offeringId);
    const occurrence = await classDeliveryService.resolveTeachingSessionOccurrence(
      offeringId,
      meetingId,
      date,
    );

    const result = await prisma.$transaction(async (tx) => {
      const exactOccurrence = await exactOccurrenceInTransaction(
        tx,
        occurrence.id,
        offeringId,
      );
      await assertActiveMonitorInTransaction(tx, userId, offeringId);

      const current = await readTimingWithClient(tx, occurrence.id, true);
      if (!current?.startedAt) {
        throw new TeachingSessionTimingValidationError(
          "Record teaching start before teaching end",
        );
      }
      if (current.endedAt) {
        return { row: current, changed: false };
      }

      const now = new Date();
      assertEndWindow(exactOccurrence, current.startedAt, now);

      const rows = await tx.$queryRaw<TimingRow[]>`
        WITH updated AS (
          UPDATE "pms_attendance"."TeachingSessionTiming"
          SET
            "endedAt" = ${now},
            "endedById" = ${userId},
            "updatedAt" = ${now}
          WHERE "occurrenceId" = ${occurrence.id}
          RETURNING *
        )
        SELECT
          t."occurrenceId", t."offeringId",
          t."startedAt", t."startedById", starter."name" AS "startedByName",
          t."endedAt", t."endedById", ender."name" AS "endedByName"
        FROM updated t
        LEFT JOIN "User" starter ON starter."id" = t."startedById"
        LEFT JOIN "User" ender ON ender."id" = t."endedById"
      `;

      if (!rows[0]) {
        throw new TeachingSessionTimingReferenceError(
          "Teaching end timestamp was not persisted",
        );
      }
      return { row: rows[0], changed: true };
    });

    return { timing: timingView(result.row), changed: result.changed };
  },
};
