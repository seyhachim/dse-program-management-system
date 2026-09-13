import { randomUUID } from "node:crypto";
import {
  LECTURER_ARRIVAL_EARLY_WINDOW_MINUTES,
  type SaveLecturerArrivalConfirmationResult,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import {
  TeachingSessionOccurrenceReferenceError,
  TeachingSessionOccurrenceValidationError,
  classDeliveryService,
} from "./class-delivery-service.ts";
import {
  ClassResponsibilityEligibilityError,
  classResponsibilityService,
} from "./class-responsibility-service.ts";

interface ArrivalRow {
  id: string;
  offeringId: string;
  date: Date;
  status: "Present" | "NotYet";
  note: string;
  recordedById: string;
  recordedByName: string;
  recordedAt: Date;
  updatedAt: Date;
}

interface ExactOccurrenceRow {
  id: string;
  offeringId: string;
  sessionDate: Date;
  scheduledStartTime: string;
  scheduledEndTime: string;
}

function arrivalView(row: ArrivalRow): SaveLecturerArrivalConfirmationResult["confirmation"] {
  return {
    id: row.id,
    offeringId: row.offeringId,
    date: row.date.toISOString().slice(0, 10),
    status: row.status,
    note: row.note,
    recordedBy: { id: row.recordedById, name: row.recordedByName },
    recordedAt: row.recordedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function occurrenceInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+07:00`);
}

function assertArrivalRecordingWindow(occurrence: ExactOccurrenceRow, now: Date): void {
  const date = occurrence.sessionDate.toISOString().slice(0, 10);
  const scheduledStart = occurrenceInstant(date, occurrence.scheduledStartTime);
  const scheduledEnd = occurrenceInstant(date, occurrence.scheduledEndTime);
  const opensAt = new Date(
    scheduledStart.getTime() - LECTURER_ARRIVAL_EARLY_WINDOW_MINUTES * 60_000,
  );

  if (now < opensAt) {
    throw new TeachingSessionOccurrenceValidationError(
      `Lecturer arrival can be recorded from ${LECTURER_ARRIVAL_EARLY_WINDOW_MINUTES} minutes before the scheduled start`,
    );
  }
  if (now > scheduledEnd) {
    throw new TeachingSessionOccurrenceValidationError(
      "Lecturer arrival can no longer be recorded after the scheduled class end",
    );
  }
}

export const monitorLecturerArrivalService = {
  async markArrived(
    offeringId: string,
    meetingId: string,
    date: string,
    userId: string,
  ): Promise<SaveLecturerArrivalConfirmationResult> {
    // Fail before materializing an occurrence for an unauthorized student.
    await classResponsibilityService.assertActiveForUser(userId, offeringId);
    const occurrence = await classDeliveryService.resolveTeachingSessionOccurrence(
      offeringId,
      meetingId,
      date,
    );

    const result = await prisma.$transaction(async (tx) => {
      const occurrenceRows = await tx.$queryRaw<ExactOccurrenceRow[]>`
        SELECT "id", "offeringId", "sessionDate", "scheduledStartTime", "scheduledEndTime"
        FROM "pms_attendance"."TeachingSessionOccurrence"
        WHERE "id" = ${occurrence.id}
          AND "offeringId" = ${offeringId}
        FOR SHARE
      `;
      const exactOccurrence = occurrenceRows[0];
      if (!exactOccurrence) {
        throw new TeachingSessionOccurrenceReferenceError(
          "Teaching session occurrence not found",
        );
      }

      // Recheck and lock monitor authority in the same transaction as the arrival punch.
      // Revocation/reassignment therefore cannot race the factual write.
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

      const existing = await tx.$queryRaw<ArrivalRow[]>`
        SELECT
          c."id", c."offeringId", c."date", c."status", c."note", c."recordedById",
          u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
        FROM "pms_attendance"."LecturerArrivalConfirmation" c
        JOIN "User" u ON u."id" = c."recordedById"
        WHERE c."occurrenceId" = ${occurrence.id}
        FOR UPDATE OF c
      `;
      const current = existing[0];

      // A Present punch is immutable through this action: repeated taps preserve the
      // original server timestamp instead of moving the lecturer's arrival later.
      if (current?.status === "Present") {
        return { row: current, changed: false };
      }

      const now = new Date();
      // The timestamp is only meaningful when observed near the real class occurrence.
      // Reject night-before / after-class punches even if a client bypasses the UI gate.
      assertArrivalRecordingWindow(exactOccurrence, now);

      const rows = current
        ? await tx.$queryRaw<ArrivalRow[]>`
            UPDATE "pms_attendance"."LecturerArrivalConfirmation" c
            SET "status" = 'Present',
                "note" = '',
                "recordedById" = ${userId},
                "recordedAt" = ${now},
                "updatedAt" = ${now}
            FROM "User" u
            WHERE c."id" = ${current.id}
              AND u."id" = ${userId}
            RETURNING
              c."id", c."offeringId", c."date", c."status", c."note", c."recordedById",
              u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
          `
        : await tx.$queryRaw<ArrivalRow[]>`
            WITH inserted AS (
              INSERT INTO "pms_attendance"."LecturerArrivalConfirmation" (
                "id", "offeringId", "date", "occurrenceId", "status", "note",
                "recordedById", "recordedAt", "updatedAt"
              ) VALUES (
                ${randomUUID()}, ${offeringId}, ${exactOccurrence.sessionDate}, ${occurrence.id},
                'Present', '', ${userId}, ${now}, ${now}
              )
              RETURNING *
            )
            SELECT
              i."id", i."offeringId", i."date", i."status", i."note", i."recordedById",
              u."name" AS "recordedByName", i."recordedAt", i."updatedAt"
            FROM inserted i
            JOIN "User" u ON u."id" = i."recordedById"
          `;

      if (!rows[0]) {
        throw new Error("Lecturer arrival timestamp was not persisted");
      }
      return { row: rows[0], changed: true };
    });

    return { confirmation: arrivalView(result.row), changed: result.changed };
  },
};
