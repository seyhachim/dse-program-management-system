import { randomUUID } from "node:crypto";
import type {
  ClassResponsibilityRole,
  LecturerArrivalStatus,
  MonitorClassResponsibilityView,
  SaveTeachingSessionDeliveryInput,
  SaveTeachingSessionDeliveryResult,
  TeachingSessionDeliveryAuditEventView,
  TeachingSessionDeliverySnapshot,
  TeachingSessionDeliveryView,
  TeachingSessionMonitorContextView,
  TeachingSessionOccurrenceView,
  TeachingSessionPlannedWeekView,
} from "@dse-pms/shared-types";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import { classDeliveryService } from "./class-delivery-service.ts";
import {
  ClassResponsibilityEligibilityError,
  classResponsibilityService,
} from "./class-responsibility-service.ts";

export class TeachingSessionDeliveryReferenceError extends Error {}
export class TeachingSessionDeliveryValidationError extends Error {}

interface DeliveryRow {
  id: string;
  occurrenceId: string;
  offeringId: string;
  classOccurred: boolean;
  actualLecturerId: string | null;
  actualLecturerName: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  deliveredMinutes: number;
  actualTopic: string;
  learningSummary: string;
  coverage: TeachingSessionDeliverySnapshot["coverage"];
  note: string;
  plannedCourseSpecId: string | null;
  plannedWeekId: string | null;
  plannedWeekNumber: number | null;
  plannedTopic: string;
  recordedById: string;
  recordedByName: string;
  recordedAt: Date;
  updatedAt: Date;
  revision: number;
}

interface AuditRow {
  id: string;
  deliveryId: string;
  occurrenceId: string;
  actorId: string;
  actorName: string;
  revision: number;
  previousSnapshot: TeachingSessionDeliverySnapshot | null;
  newSnapshot: TeachingSessionDeliverySnapshot;
  createdAt: Date;
}

interface OccurrenceIdentityRow {
  id: string;
  offeringId: string;
  sessionDate: Date;
}

interface MonitorAssignmentRow {
  offeringId: string;
  role: ClassResponsibilityRole;
}

interface ArrivalIdentityRow {
  id: string;
  status: LecturerArrivalStatus;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function teachingSessionDeliveredMinutes(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const start = startHour! * 60 + startMinute!;
  const end = endHour! * 60 + endMinute!;
  if (end <= start) {
    throw new TeachingSessionDeliveryValidationError(
      "Actual end time must be after actual start time",
    );
  }
  return end - start;
}

function deliverySnapshot(row: Pick<
  DeliveryRow,
  | "classOccurred"
  | "actualLecturerId"
  | "actualStartTime"
  | "actualEndTime"
  | "deliveredMinutes"
  | "actualTopic"
  | "learningSummary"
  | "coverage"
  | "note"
>): TeachingSessionDeliverySnapshot {
  return {
    classOccurred: row.classOccurred,
    actualLecturerId: row.actualLecturerId,
    actualStartTime: row.actualStartTime,
    actualEndTime: row.actualEndTime,
    deliveredMinutes: row.deliveredMinutes,
    actualTopic: row.actualTopic,
    learningSummary: row.learningSummary,
    coverage: row.coverage,
    note: row.note,
  };
}

function plannedWeekFromRow(row: DeliveryRow): TeachingSessionPlannedWeekView | null {
  if (
    !row.plannedCourseSpecId ||
    !row.plannedWeekId ||
    row.plannedWeekNumber === null
  ) {
    return null;
  }
  return {
    courseSpecId: row.plannedCourseSpecId,
    id: row.plannedWeekId,
    week: row.plannedWeekNumber,
    topic: row.plannedTopic,
  };
}

function deliveryView(row: DeliveryRow): TeachingSessionDeliveryView {
  return {
    id: row.id,
    occurrenceId: row.occurrenceId,
    offeringId: row.offeringId,
    classOccurred: row.classOccurred,
    actualLecturer:
      row.actualLecturerId && row.actualLecturerName
        ? { id: row.actualLecturerId, name: row.actualLecturerName }
        : null,
    actualStartTime: row.actualStartTime,
    actualEndTime: row.actualEndTime,
    deliveredMinutes: row.deliveredMinutes,
    deliveredContactHours: Math.round((row.deliveredMinutes / 60) * 100) / 100,
    actualTopic: row.actualTopic,
    learningSummary: row.learningSummary,
    coverage: row.coverage,
    note: row.note,
    plannedWeek: plannedWeekFromRow(row),
    recordedBy: { id: row.recordedById, name: row.recordedByName },
    recordedAt: row.recordedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revision: row.revision,
  };
}

function auditView(row: AuditRow): TeachingSessionDeliveryAuditEventView {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    occurrenceId: row.occurrenceId,
    revision: row.revision,
    actor: { id: row.actorId, name: row.actorName },
    previousSnapshot: row.previousSnapshot,
    newSnapshot: row.newSnapshot,
    createdAt: row.createdAt.toISOString(),
  };
}

async function readDelivery(occurrenceId: string): Promise<DeliveryRow | null> {
  const rows = await prisma.$queryRaw<DeliveryRow[]>`
    SELECT
      d."id", d."occurrenceId", d."offeringId", d."classOccurred",
      d."actualLecturerId", lecturer."name" AS "actualLecturerName",
      d."actualStartTime", d."actualEndTime", d."deliveredMinutes",
      d."actualTopic", d."learningSummary", d."coverage", d."note",
      d."plannedCourseSpecId", d."plannedWeekId", d."plannedWeekNumber", d."plannedTopic",
      d."recordedById", recorder."name" AS "recordedByName",
      d."recordedAt", d."updatedAt", d."revision"
    FROM "pms_attendance"."TeachingSessionDelivery" d
    LEFT JOIN "User" lecturer ON lecturer."id" = d."actualLecturerId"
    JOIN "User" recorder ON recorder."id" = d."recordedById"
    WHERE d."occurrenceId" = ${occurrenceId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function plannedWeekForOccurrence(
  occurrence: TeachingSessionOccurrenceView,
): Promise<TeachingSessionPlannedWeekView | null> {
  const offering = await prisma.offering.findUnique({
    where: { id: occurrence.offeringId },
    select: {
      courseSpecId: true,
      startDate: true,
      academicCalendarPeriod: { select: { teachingStart: true } },
      courseSpec: { select: { id: true, reviewStatus: true } },
    },
  });
  if (!offering) {
    throw new TeachingSessionDeliveryReferenceError("Offering not found");
  }
  if (!offering.courseSpec || offering.courseSpec.reviewStatus !== "Approved") {
    return null;
  }

  const teachingStart = offering.academicCalendarPeriod?.teachingStart ?? offering.startDate;
  if (!teachingStart) return null;
  const sessionDate = new Date(`${occurrence.date}T00:00:00.000Z`);
  const start = new Date(`${dateOnly(teachingStart)}T00:00:00.000Z`);
  const week = Math.floor((sessionDate.getTime() - start.getTime()) / (7 * DAY_MS)) + 1;
  if (week < 1) return null;

  const rows = await prisma.courseSpecWeek.findMany({
    where: { courseSpecId: offering.courseSpec.id, week },
    select: { courseSpecId: true, id: true, week: true, topic: true },
    orderBy: { order: "asc" },
    take: 2,
  });
  if (rows.length > 1) {
    throw new TeachingSessionDeliveryValidationError(
      `Approved CourseSpec has multiple Weekly Plan rows for Week ${week}`,
    );
  }
  return rows[0] ?? null;
}

async function eligibleLecturers(offeringId: string) {
  const offering = await prisma.offering.findUnique({
    where: { id: offeringId },
    select: {
      lecturer: { select: { id: true, name: true } },
      coLecturers: {
        include: { lecturer: { select: { id: true, name: true } } },
      },
    },
  });
  if (!offering) throw new TeachingSessionDeliveryReferenceError("Offering not found");
  const lecturers = [
    ...(offering.lecturer ? [offering.lecturer] : []),
    ...offering.coLecturers.map((item) => item.lecturer),
  ];
  return [...new Map(lecturers.map((lecturer) => [lecturer.id, lecturer])).values()];
}

async function assertActiveMonitorInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  offeringId: string,
): Promise<MonitorClassResponsibilityView> {
  const rows = await tx.$queryRaw<MonitorAssignmentRow[]>`
    SELECT a."offeringId", a."role"
    FROM "ClassResponsibilityAssignment" a
    JOIN "Student" s ON s."id" = a."studentId"
    JOIN "Enrollment" en
      ON en."studentId" = s."id" AND en."offeringId" = a."offeringId"
    WHERE s."userId" = ${userId}
      AND s."status" = 'Active'::"StudentStatus"
      AND a."offeringId" = ${offeringId}
      AND a."revokedAt" IS NULL
      AND a."role" IN ('ClassMonitor'::"ClassResponsibilityRole", 'SubClassMonitor'::"ClassResponsibilityRole")
    FOR SHARE OF a, s, en
    LIMIT 1
  `;
  const assignment = rows[0];
  if (!assignment) {
    throw new ClassResponsibilityEligibilityError(
      "You are not an active class monitor for this offering",
    );
  }
  return assignment;
}

async function assertEligibleActualLecturerInTransaction(
  tx: Prisma.TransactionClient,
  offeringId: string,
  lecturerId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT u."id"
    FROM "Offering" o
    JOIN "User" u ON u."id" = ${lecturerId}
    WHERE o."id" = ${offeringId}
      AND (
        o."lecturerId" = u."id"
        OR EXISTS (
          SELECT 1 FROM "OfferingCoLecturer" co
          WHERE co."offeringId" = o."id" AND co."lecturerId" = u."id"
        )
      )
    FOR SHARE OF o, u
    LIMIT 1
  `;
  if (!rows[0]) {
    throw new TeachingSessionDeliveryValidationError(
      "Actual lecturer must be assigned to this course offering",
    );
  }
}

function normalizedSnapshot(
  input: SaveTeachingSessionDeliveryInput,
): TeachingSessionDeliverySnapshot {
  if (!input.classOccurred) {
    return {
      classOccurred: false,
      actualLecturerId: null,
      actualStartTime: null,
      actualEndTime: null,
      deliveredMinutes: 0,
      actualTopic: input.actualTopic,
      learningSummary: "",
      coverage: "NOT_COVERED",
      note: input.note,
    };
  }
  if (!input.actualLecturerId || !input.actualStartTime || !input.actualEndTime) {
    throw new TeachingSessionDeliveryValidationError(
      "Actual lecturer, start time, and end time are required when the class occurred",
    );
  }
  return {
    classOccurred: true,
    actualLecturerId: input.actualLecturerId,
    actualStartTime: input.actualStartTime,
    actualEndTime: input.actualEndTime,
    deliveredMinutes: teachingSessionDeliveredMinutes(input.actualStartTime, input.actualEndTime),
    actualTopic: input.actualTopic,
    learningSummary: input.learningSummary,
    coverage: input.coverage,
    note: input.note,
  };
}

export const teachingSessionDeliveryService = {
  async listMonitorAssignments(userId: string): Promise<MonitorClassResponsibilityView[]> {
    const rows = await prisma.$queryRaw<MonitorAssignmentRow[]>`
      SELECT a."offeringId", a."role"
      FROM "ClassResponsibilityAssignment" a
      JOIN "Student" s ON s."id" = a."studentId"
      JOIN "Enrollment" en
        ON en."studentId" = s."id" AND en."offeringId" = a."offeringId"
      WHERE s."userId" = ${userId}
        AND s."status" = 'Active'::"StudentStatus"
        AND a."revokedAt" IS NULL
        AND a."role" IN ('ClassMonitor'::"ClassResponsibilityRole", 'SubClassMonitor'::"ClassResponsibilityRole")
      ORDER BY a."offeringId"
    `;
    return rows;
  },

  async getDelivery(occurrenceId: string): Promise<TeachingSessionDeliveryView | null> {
    const row = await readDelivery(occurrenceId);
    return row ? deliveryView(row) : null;
  },

  async getHistory(occurrenceId: string): Promise<TeachingSessionDeliveryAuditEventView[]> {
    const rows = await prisma.$queryRaw<AuditRow[]>`
      SELECT
        e."id", e."deliveryId", e."occurrenceId", e."actorId",
        actor."name" AS "actorName", e."revision",
        e."previousSnapshot", e."newSnapshot", e."createdAt"
      FROM "pms_attendance"."TeachingSessionDeliveryAuditEvent" e
      JOIN "User" actor ON actor."id" = e."actorId"
      WHERE e."occurrenceId" = ${occurrenceId}
      ORDER BY e."revision" ASC
    `;
    return rows.map(auditView);
  },

  async monitorContext(
    offeringId: string,
    meetingId: string,
    date: string,
    userId: string,
  ): Promise<TeachingSessionMonitorContextView> {
    const responsibility = await classResponsibilityService.assertActiveForUser(
      userId,
      offeringId,
    );
    const occurrence = await classDeliveryService.resolveTeachingSessionOccurrence(
      offeringId,
      meetingId,
      date,
    );
    const [delivery, currentPlannedWeek, lecturers, lecturerArrival, history] = await Promise.all([
      this.getDelivery(occurrence.id),
      plannedWeekForOccurrence(occurrence),
      eligibleLecturers(offeringId),
      classDeliveryService.getLecturerArrivalForOccurrence(occurrence.id),
      this.getHistory(occurrence.id),
    ]);
    return {
      responsibility: { offeringId, role: responsibility.role },
      occurrence,
      plannedWeek: delivery?.plannedWeek ?? currentPlannedWeek,
      eligibleLecturers: lecturers,
      lecturerArrival,
      delivery,
      history,
    };
  },

  async saveMonitorDelivery(
    offeringId: string,
    meetingId: string,
    date: string,
    input: SaveTeachingSessionDeliveryInput,
    userId: string,
  ): Promise<SaveTeachingSessionDeliveryResult> {
    await classResponsibilityService.assertActiveForUser(userId, offeringId);
    const occurrence = await classDeliveryService.resolveTeachingSessionOccurrence(
      offeringId,
      meetingId,
      date,
    );
    const snapshot = normalizedSnapshot(input);
    const plannedWeek = await plannedWeekForOccurrence(occurrence);

    const result = await prisma.$transaction(async (tx) => {
      await assertActiveMonitorInTransaction(tx, userId, offeringId);

      const occurrences = await tx.$queryRaw<OccurrenceIdentityRow[]>`
        SELECT "id", "offeringId", "sessionDate"
        FROM "pms_attendance"."TeachingSessionOccurrence"
        WHERE "id" = ${occurrence.id} AND "offeringId" = ${offeringId}
        FOR UPDATE
      `;
      const exactOccurrence = occurrences[0];
      if (!exactOccurrence) {
        throw new TeachingSessionDeliveryReferenceError(
          "Teaching session occurrence not found for this offering",
        );
      }

      if (snapshot.actualLecturerId) {
        await assertEligibleActualLecturerInTransaction(
          tx,
          offeringId,
          snapshot.actualLecturerId,
        );
      }

      const existingRows = await tx.$queryRaw<DeliveryRow[]>`
        SELECT
          d."id", d."occurrenceId", d."offeringId", d."classOccurred",
          d."actualLecturerId", lecturer."name" AS "actualLecturerName",
          d."actualStartTime", d."actualEndTime", d."deliveredMinutes",
          d."actualTopic", d."learningSummary", d."coverage", d."note",
          d."plannedCourseSpecId", d."plannedWeekId", d."plannedWeekNumber", d."plannedTopic",
          d."recordedById", recorder."name" AS "recordedByName",
          d."recordedAt", d."updatedAt", d."revision"
        FROM "pms_attendance"."TeachingSessionDelivery" d
        LEFT JOIN "User" lecturer ON lecturer."id" = d."actualLecturerId"
        JOIN "User" recorder ON recorder."id" = d."recordedById"
        WHERE d."occurrenceId" = ${occurrence.id}
        FOR UPDATE OF d
      `;
      const current = existingRows[0];
      const now = new Date();

      let arrivalChanged = false;
      if (input.lecturerArrivalStatus) {
        const arrivalRows = await tx.$queryRaw<ArrivalIdentityRow[]>`
          SELECT "id", "status"
          FROM "pms_attendance"."LecturerArrivalConfirmation"
          WHERE "occurrenceId" = ${occurrence.id}
          FOR UPDATE
        `;
        const currentArrival = arrivalRows[0];
        if (currentArrival?.status !== input.lecturerArrivalStatus) {
          if (currentArrival) {
            await tx.$executeRaw`
              UPDATE "pms_attendance"."LecturerArrivalConfirmation"
              SET "status" = ${input.lecturerArrivalStatus},
                  "note" = '',
                  "recordedById" = ${userId},
                  "recordedAt" = ${now},
                  "updatedAt" = ${now}
              WHERE "id" = ${currentArrival.id}
            `;
          } else {
            await tx.$executeRaw`
              INSERT INTO "pms_attendance"."LecturerArrivalConfirmation" (
                "id", "offeringId", "date", "occurrenceId", "status", "note",
                "recordedById", "recordedAt", "updatedAt"
              ) VALUES (
                ${randomUUID()}, ${offeringId}, ${exactOccurrence.sessionDate}, ${occurrence.id},
                ${input.lecturerArrivalStatus}, '', ${userId}, ${now}, ${now}
              )
            `;
          }
          arrivalChanged = true;
        }
      }

      if (current && JSON.stringify(deliverySnapshot(current)) === JSON.stringify(snapshot)) {
        return { row: current, changed: arrivalChanged };
      }

      const revision = (current?.revision ?? 0) + 1;
      const previousSnapshot = current ? deliverySnapshot(current) : null;
      const deliveryId = current?.id ?? randomUUID();
      let saved: DeliveryRow | undefined;

      if (current) {
        const rows = await tx.$queryRaw<DeliveryRow[]>`
          WITH updated AS (
            UPDATE "pms_attendance"."TeachingSessionDelivery"
            SET
              "classOccurred" = ${snapshot.classOccurred},
              "actualLecturerId" = ${snapshot.actualLecturerId},
              "actualStartTime" = ${snapshot.actualStartTime},
              "actualEndTime" = ${snapshot.actualEndTime},
              "deliveredMinutes" = ${snapshot.deliveredMinutes},
              "actualTopic" = ${snapshot.actualTopic},
              "learningSummary" = ${snapshot.learningSummary},
              "coverage" = ${snapshot.coverage},
              "note" = ${snapshot.note},
              "recordedById" = ${userId},
              "recordedAt" = ${now},
              "updatedAt" = ${now},
              "revision" = ${revision}
            WHERE "id" = ${current.id}
            RETURNING *
          )
          SELECT
            d."id", d."occurrenceId", d."offeringId", d."classOccurred",
            d."actualLecturerId", lecturer."name" AS "actualLecturerName",
            d."actualStartTime", d."actualEndTime", d."deliveredMinutes",
            d."actualTopic", d."learningSummary", d."coverage", d."note",
            d."plannedCourseSpecId", d."plannedWeekId", d."plannedWeekNumber", d."plannedTopic",
            d."recordedById", recorder."name" AS "recordedByName",
            d."recordedAt", d."updatedAt", d."revision"
          FROM updated d
          LEFT JOIN "User" lecturer ON lecturer."id" = d."actualLecturerId"
          JOIN "User" recorder ON recorder."id" = d."recordedById"
        `;
        saved = rows[0];
      } else {
        const rows = await tx.$queryRaw<DeliveryRow[]>`
          WITH inserted AS (
            INSERT INTO "pms_attendance"."TeachingSessionDelivery" (
              "id", "occurrenceId", "offeringId", "classOccurred",
              "actualLecturerId", "actualStartTime", "actualEndTime", "deliveredMinutes",
              "actualTopic", "learningSummary", "coverage", "note",
              "plannedCourseSpecId", "plannedWeekId", "plannedWeekNumber", "plannedTopic",
              "recordedById", "recordedAt", "updatedAt", "revision"
            ) VALUES (
              ${deliveryId}, ${occurrence.id}, ${offeringId}, ${snapshot.classOccurred},
              ${snapshot.actualLecturerId}, ${snapshot.actualStartTime}, ${snapshot.actualEndTime},
              ${snapshot.deliveredMinutes}, ${snapshot.actualTopic}, ${snapshot.learningSummary},
              ${snapshot.coverage}, ${snapshot.note},
              ${plannedWeek?.courseSpecId ?? null}, ${plannedWeek?.id ?? null},
              ${plannedWeek?.week ?? null}, ${plannedWeek?.topic ?? ""},
              ${userId}, ${now}, ${now}, ${revision}
            )
            RETURNING *
          )
          SELECT
            d."id", d."occurrenceId", d."offeringId", d."classOccurred",
            d."actualLecturerId", lecturer."name" AS "actualLecturerName",
            d."actualStartTime", d."actualEndTime", d."deliveredMinutes",
            d."actualTopic", d."learningSummary", d."coverage", d."note",
            d."plannedCourseSpecId", d."plannedWeekId", d."plannedWeekNumber", d."plannedTopic",
            d."recordedById", recorder."name" AS "recordedByName",
            d."recordedAt", d."updatedAt", d."revision"
          FROM inserted d
          LEFT JOIN "User" lecturer ON lecturer."id" = d."actualLecturerId"
          JOIN "User" recorder ON recorder."id" = d."recordedById"
        `;
        saved = rows[0];
      }
      if (!saved) throw new Error("Teaching session delivery was not persisted");

      await tx.$executeRaw`
        INSERT INTO "pms_attendance"."TeachingSessionDeliveryAuditEvent" (
          "id", "deliveryId", "occurrenceId", "actorId", "revision",
          "previousSnapshot", "newSnapshot", "createdAt"
        ) VALUES (
          ${randomUUID()}, ${deliveryId}, ${occurrence.id}, ${userId}, ${revision},
          ${previousSnapshot ? JSON.stringify(previousSnapshot) : null}::jsonb,
          ${JSON.stringify(snapshot)}::jsonb,
          ${now}
        )
      `;

      return { row: saved, changed: true };
    });

    return { delivery: deliveryView(result.row), changed: result.changed };
  },
};

export type TeachingSessionDeliveryService = typeof teachingSessionDeliveryService;
