import { randomUUID } from "node:crypto";
import type {
  LecturerArrivalConfirmationView,
  LecturerArrivalStatus,
  SaveLecturerArrivalConfirmationResult,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

interface ConfirmationRow {
  id: string;
  offeringId: string;
  date: Date;
  status: LecturerArrivalStatus;
  recordedById: string;
  recordedByName: string;
  recordedAt: Date;
  updatedAt: Date;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function view(row: ConfirmationRow): LecturerArrivalConfirmationView {
  return {
    id: row.id,
    offeringId: row.offeringId,
    date: dateOnly(row.date),
    status: row.status,
    recordedBy: { id: row.recordedById, name: row.recordedByName },
    recordedAt: row.recordedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function readRow(offeringId: string, date: string): Promise<ConfirmationRow | null> {
  const rows = await prisma.$queryRaw<ConfirmationRow[]>`
    SELECT
      c."id", c."offeringId", c."date", c."status", c."recordedById",
      u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
    FROM "pms_attendance"."LecturerArrivalConfirmation" c
    JOIN "User" u ON u."id" = c."recordedById"
    WHERE c."offeringId" = ${offeringId}
      AND c."date" = ${date}::date
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export const classDeliveryService = {
  async getLecturerArrival(
    offeringId: string,
    date: string,
  ): Promise<LecturerArrivalConfirmationView | null> {
    const row = await readRow(offeringId, date);
    return row ? view(row) : null;
  },

  async saveLecturerArrival(
    offeringId: string,
    date: string,
    status: LecturerArrivalStatus,
    actorId: string,
  ): Promise<SaveLecturerArrivalConfirmationResult> {
    const result = await prisma.$transaction(async (tx) => {
      const offering = await tx.offering.findUnique({ where: { id: offeringId }, select: { id: true } });
      if (!offering) throw new ReferenceError("Offering not found");

      const existing = await tx.$queryRaw<ConfirmationRow[]>`
        SELECT
          c."id", c."offeringId", c."date", c."status", c."recordedById",
          u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
        FROM "pms_attendance"."LecturerArrivalConfirmation" c
        JOIN "User" u ON u."id" = c."recordedById"
        WHERE c."offeringId" = ${offeringId}
          AND c."date" = ${date}::date
        FOR UPDATE OF c
      `;
      const current = existing[0];
      if (current?.status === status) {
        return { row: current, changed: false };
      }

      const now = new Date();
      const rows = current
        ? await tx.$queryRaw<ConfirmationRow[]>`
            UPDATE "pms_attendance"."LecturerArrivalConfirmation" c
            SET "status" = ${status},
                "recordedById" = ${actorId},
                "recordedAt" = ${now},
                "updatedAt" = ${now}
            FROM "User" u
            WHERE c."id" = ${current.id}
              AND u."id" = ${actorId}
            RETURNING
              c."id", c."offeringId", c."date", c."status", c."recordedById",
              u."name" AS "recordedByName", c."recordedAt", c."updatedAt"
          `
        : await tx.$queryRaw<ConfirmationRow[]>`
            WITH inserted AS (
              INSERT INTO "pms_attendance"."LecturerArrivalConfirmation" (
                "id", "offeringId", "date", "status", "recordedById", "recordedAt", "updatedAt"
              ) VALUES (
                ${randomUUID()}, ${offeringId}, ${date}::date, ${status}, ${actorId}, ${now}, ${now}
              )
              RETURNING *
            )
            SELECT
              i."id", i."offeringId", i."date", i."status", i."recordedById",
              u."name" AS "recordedByName", i."recordedAt", i."updatedAt"
            FROM inserted i
            JOIN "User" u ON u."id" = i."recordedById"
          `;
      if (!rows[0]) throw new Error("Lecturer arrival confirmation was not persisted");
      return { row: rows[0], changed: true };
    });

    return { confirmation: view(result.row), changed: result.changed };
  },
};

export type ClassDeliveryService = typeof classDeliveryService;
