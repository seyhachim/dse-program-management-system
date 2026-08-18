import { randomUUID } from "node:crypto";
import type {
  ClassSessionStatus,
  ClassSessionStatusView,
  LecturerArrivalConfirmationView,
  LecturerArrivalStatus,
  SaveClassSessionStatusResult,
  SaveLecturerArrivalConfirmationResult,
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

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
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

async function readArrivalRow(offeringId: string, date: string): Promise<ArrivalRow | null> {
  const rows = await prisma.$queryRaw<ArrivalRow[]>`
    SELECT
      c."id", c."offeringId", c."date", c."status", c."note", c."recordedById",
      u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
    FROM "pms_attendance"."LecturerArrivalConfirmation" c
    JOIN "User" u ON u."id" = c."recordedById"
    WHERE c."offeringId" = ${offeringId}
      AND c."date" = ${date}::date
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function readSessionRow(offeringId: string, date: string): Promise<SessionRow | null> {
  const rows = await prisma.$queryRaw<SessionRow[]>`
    SELECT
      s."id", s."offeringId", s."date", s."status", s."reason", s."recordedById",
      u."name" AS "recordedByName", s."recordedAt", s."updatedAt"
    FROM "pms_attendance"."ClassSessionStatus" s
    JOIN "User" u ON u."id" = s."recordedById"
    WHERE s."offeringId" = ${offeringId}
      AND s."date" = ${date}::date
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export const classDeliveryService = {
  async getLecturerArrival(
    offeringId: string,
    date: string,
  ): Promise<LecturerArrivalConfirmationView | null> {
    const row = await readArrivalRow(offeringId, date);
    return row ? arrivalView(row) : null;
  },

  async getClassSessionStatus(
    offeringId: string,
    date: string,
  ): Promise<ClassSessionStatusView | null> {
    const row = await readSessionRow(offeringId, date);
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
        SELECT "id"
        FROM "Offering"
        WHERE "id" = ${offeringId}
        FOR UPDATE
      `;
      if (!offerings[0]) throw new ReferenceError("Offering not found");

      const existing = await tx.$queryRaw<ArrivalRow[]>`
        SELECT
          c."id", c."offeringId", c."date", c."status", c."note", c."recordedById",
          u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
        FROM "pms_attendance"."LecturerArrivalConfirmation" c
        JOIN "User" u ON u."id" = c."recordedById"
        WHERE c."offeringId" = ${offeringId}
          AND c."date" = ${date}::date
        FOR UPDATE OF c
      `;
      const current = existing[0];
      if (current?.status === status && current.note === note) {
        return { row: current, changed: false };
      }

      const now = new Date();
      const rows = current
        ? await tx.$queryRaw<ArrivalRow[]>`
            UPDATE "pms_attendance"."LecturerArrivalConfirmation" c
            SET "status" = ${status},
                "note" = ${note},
                "recordedById" = ${actorId},
                "recordedAt" = ${now},
                "updatedAt" = ${now}
            FROM "User" u
            WHERE c."id" = ${current.id}
              AND u."id" = ${actorId}
            RETURNING
              c."id", c."offeringId", c."date", c."status", c."note", c."recordedById",
              u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
          `
        : await tx.$queryRaw<ArrivalRow[]>`
            WITH inserted AS (
              INSERT INTO "pms_attendance"."LecturerArrivalConfirmation" (
                "id", "offeringId", "date", "status", "note", "recordedById", "recordedAt", "updatedAt"
              ) VALUES (
                ${randomUUID()}, ${offeringId}, ${date}::date, ${status}, ${note}, ${actorId}, ${now}, ${now}
              )
              RETURNING *
            )
            SELECT
              i."id", i."offeringId", i."date", i."status", i."note", i."recordedById",
              u."name" AS "recordedByName", i."recordedAt", i."updatedAt"
            FROM inserted i
            JOIN "User" u ON u."id" = i."recordedById"
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
        SELECT "id"
        FROM "Offering"
        WHERE "id" = ${offeringId}
        FOR UPDATE
      `;
      if (!offerings[0]) throw new ReferenceError("Offering not found");

      const existing = await tx.$queryRaw<SessionRow[]>`
        SELECT
          s."id", s."offeringId", s."date", s."status", s."reason", s."recordedById",
          u."name" AS "recordedByName", s."recordedAt", s."updatedAt"
        FROM "pms_attendance"."ClassSessionStatus" s
        JOIN "User" u ON u."id" = s."recordedById"
        WHERE s."offeringId" = ${offeringId}
          AND s."date" = ${date}::date
        FOR UPDATE OF s
      `;
      const current = existing[0];
      if (current?.status === status && current.reason === reason) {
        return { row: current, changed: false };
      }

      const now = new Date();
      const rows = current
        ? await tx.$queryRaw<SessionRow[]>`
            UPDATE "pms_attendance"."ClassSessionStatus" s
            SET "status" = ${status},
                "reason" = ${reason},
                "recordedById" = ${actorId},
                "recordedAt" = ${now},
                "updatedAt" = ${now}
            FROM "User" u
            WHERE s."id" = ${current.id}
              AND u."id" = ${actorId}
            RETURNING
              s."id", s."offeringId", s."date", s."status", s."reason", s."recordedById",
              u."name" AS "recordedByName", s."recordedAt", s."updatedAt"
          `
        : await tx.$queryRaw<SessionRow[]>`
            WITH inserted AS (
              INSERT INTO "pms_attendance"."ClassSessionStatus" (
                "id", "offeringId", "date", "status", "reason", "recordedById", "recordedAt", "updatedAt"
              ) VALUES (
                ${randomUUID()}, ${offeringId}, ${date}::date, ${status}, ${reason}, ${actorId}, ${now}, ${now}
              )
              RETURNING *
            )
            SELECT
              i."id", i."offeringId", i."date", i."status", i."reason", i."recordedById",
              u."name" AS "recordedByName", i."recordedAt", i."updatedAt"
            FROM inserted i
            JOIN "User" u ON u."id" = i."recordedById"
          `;
      if (!rows[0]) throw new Error("Class session status was not persisted");
      return { row: rows[0], changed: true };
    });

    return { session: sessionView(result.row), changed: result.changed };
  },
};

export type ClassDeliveryService = typeof classDeliveryService;
