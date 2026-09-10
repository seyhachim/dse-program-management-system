import type {
  AcademicCalendarServiceContract,
  OfferingActivationExceptionAuditAction,
  OfferingActivationExceptionAuditEvent,
  OfferingActivationExceptionMissingItem,
  OfferingActivationExceptionSnapshot,
  OfferingActivationExceptionStatus,
  OfferingActivationExceptionView,
  RequestOfferingActivationExceptionInput,
  ReviewOfferingActivationExceptionInput,
} from "@dse-pms/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";

export class OfferingActivationExceptionNotFoundError extends Error {}
export class OfferingActivationExceptionValidationError extends Error {}
export class OfferingActivationExceptionConflictError extends Error {}

interface ProgrammeActivationExceptionContextService {
  academicCalendar: AcademicCalendarServiceContract;
}

interface ExceptionRow {
  id: string;
  offeringId: string;
  status: OfferingActivationExceptionStatus;
  missingCurriculum: boolean;
  missingCourseSpec: boolean;
  reason: string;
  documentationDueDate: Date;
  requestedByUserId: string;
  requestedByName: string;
  requestedAt: Date;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewNote: string;
  resolvedAt: Date | null;
  revokedAt: Date | null;
  expiredAt: Date | null;
}

interface AuditRow {
  id: string;
  exceptionId: string;
  offeringId: string;
  actorId: string | null;
  actorName: string | null;
  action: OfferingActivationExceptionAuditAction;
  reason: string;
  details: unknown | null;
  createdAt: Date;
}

interface PinnedCurriculumRow {
  courseId: string;
  yearLevel: number;
  semester: "First" | "Second";
  curriculumStatus: string;
}

interface InternalReadiness {
  programmeId: string;
  offeringStatus: "Planned" | "Active" | "Completed";
  missingItems: OfferingActivationExceptionMissingItem[];
  teachingStart: string;
  teachingEnd: string;
  academicCalendarRevision: number;
}

const programme = () =>
  registry.get<ProgrammeActivationExceptionContextService>("programme").service;

const dateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;
const today = (): string => new Date().toISOString().slice(0, 10);

function missingItems(row: Pick<ExceptionRow, "missingCurriculum" | "missingCourseSpec">) {
  const items: OfferingActivationExceptionMissingItem[] = [];
  if (row.missingCurriculum) items.push("CURRICULUM");
  if (row.missingCourseSpec) items.push("COURSE_SPEC");
  return items;
}

function sameMissingSnapshot(
  row: Pick<ExceptionRow, "missingCurriculum" | "missingCourseSpec">,
  items: OfferingActivationExceptionMissingItem[],
): boolean {
  return (
    row.missingCurriculum === items.includes("CURRICULUM") &&
    row.missingCourseSpec === items.includes("COURSE_SPEC")
  );
}

function toView(row: ExceptionRow): OfferingActivationExceptionView {
  return {
    id: row.id,
    offeringId: row.offeringId,
    status: row.status,
    missingItems: missingItems(row),
    reason: row.reason,
    documentationDueDate: dateOnly(row.documentationDueDate)!,
    requestedBy: { id: row.requestedByUserId, name: row.requestedByName },
    requestedAt: row.requestedAt.toISOString(),
    reviewedBy:
      row.reviewedByUserId && row.reviewedByName
        ? { id: row.reviewedByUserId, name: row.reviewedByName }
        : null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    expiredAt: row.expiredAt?.toISOString() ?? null,
  };
}

function toAuditEvent(row: AuditRow): OfferingActivationExceptionAuditEvent {
  return {
    id: row.id,
    exceptionId: row.exceptionId,
    offeringId: row.offeringId,
    actor:
      row.actorId && row.actorName ? { id: row.actorId, name: row.actorName } : null,
    action: row.action,
    reason: row.reason,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
  };
}

async function exceptionRows(
  offeringId: string,
  where: Prisma.Sql = Prisma.sql`TRUE`,
  limit = 20,
): Promise<ExceptionRow[]> {
  return prisma.$queryRaw<ExceptionRow[]>(Prisma.sql`
    SELECT
      exception."id",
      exception."offeringId",
      exception."status",
      exception."missingCurriculum",
      exception."missingCourseSpec",
      exception."reason",
      exception."documentationDueDate",
      exception."requestedByUserId",
      requester."name" AS "requestedByName",
      exception."requestedAt",
      exception."reviewedByUserId",
      reviewer."name" AS "reviewedByName",
      exception."reviewedAt",
      exception."reviewNote",
      exception."resolvedAt",
      exception."revokedAt",
      exception."expiredAt"
    FROM offering_governance."OfferingActivationException" exception
    JOIN public."User" requester ON requester."id" = exception."requestedByUserId"
    LEFT JOIN public."User" reviewer ON reviewer."id" = exception."reviewedByUserId"
    WHERE exception."offeringId" = ${offeringId}
      AND ${where}
    ORDER BY exception."requestedAt" DESC, exception."id" DESC
    LIMIT ${limit}
  `);
}

async function auditHistory(offeringId: string): Promise<OfferingActivationExceptionAuditEvent[]> {
  const rows = await prisma.$queryRaw<AuditRow[]>(Prisma.sql`
    SELECT
      event."id",
      event."exceptionId",
      event."offeringId",
      event."actorId",
      actor."name" AS "actorName",
      event."action",
      event."reason",
      event."details",
      event."createdAt"
    FROM offering_governance."OfferingActivationExceptionAuditEvent" event
    LEFT JOIN public."User" actor ON actor."id" = event."actorId"
    WHERE event."offeringId" = ${offeringId}
    ORDER BY event."createdAt" ASC, event."id" ASC
  `);
  return rows.map(toAuditEvent);
}

async function appendAudit(
  tx: Prisma.TransactionClient,
  input: {
    exceptionId: string;
    offeringId: string;
    actorId: string | null;
    action: OfferingActivationExceptionAuditAction;
    reason?: string;
    details?: unknown;
  },
): Promise<void> {
  const details =
    input.details === undefined
      ? Prisma.sql`NULL`
      : Prisma.sql`${JSON.stringify(input.details)}::jsonb`;
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO offering_governance."OfferingActivationExceptionAuditEvent" (
      "id", "exceptionId", "offeringId", "actorId", "action", "reason", "details"
    ) VALUES (
      ${crypto.randomUUID()},
      ${input.exceptionId},
      ${input.offeringId},
      ${input.actorId},
      ${input.action}::offering_governance."OfferingActivationExceptionAuditAction",
      ${input.reason ?? ""},
      ${details}
    )
  `);
}

async function deriveReadiness(offeringId: string): Promise<InternalReadiness> {
  const offering = await prisma.offering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      courseId: true,
      course: { select: { programmeId: true } },
      courseSpecId: true,
      courseSpec: { select: { id: true, courseId: true, reviewStatus: true } },
      lecturerId: true,
      status: true,
      programmeYear: true,
      semester: true,
      academicCalendarPeriodId: true,
      meetings: { select: { id: true }, take: 1 },
    },
  });
  if (!offering) {
    throw new OfferingActivationExceptionNotFoundError("Offering not found");
  }
  if (!offering.lecturerId) {
    throw new OfferingActivationExceptionValidationError(
      "Assign a primary lecturer before requesting an activation exception",
    );
  }
  if (offering.meetings.length === 0) {
    throw new OfferingActivationExceptionValidationError(
      "Add at least one weekly class session before requesting an activation exception",
    );
  }
  if (!offering.academicCalendarPeriodId || !offering.programmeYear || !offering.semester) {
    throw new OfferingActivationExceptionValidationError(
      "A published Academic Calendar period, study year, and semester are required",
    );
  }

  const period = await programme().academicCalendar.getPublishedPeriodForOffering(
    offering.academicCalendarPeriodId,
    offering.course.programmeId,
    offering.programmeYear,
  );
  if (!period || period.semester !== offering.semester) {
    throw new OfferingActivationExceptionValidationError(
      "The Offering is not linked to a currently published Academic Calendar period for this programme and study year",
    );
  }

  const binding = await prisma.$queryRaw<PinnedCurriculumRow[]>(Prisma.sql`
    SELECT
      placement."courseId",
      placement."yearLevel",
      placement."semester",
      version."status"::text AS "curriculumStatus"
    FROM offering_governance."OfferingCurriculumBinding" binding
    JOIN public."ProgrammeCurriculumCourse" placement
      ON placement."id" = binding."curriculumCourseId"
    JOIN public."ProgrammeCurriculumVersion" version
      ON version."id" = placement."curriculumVersionId"
    WHERE binding."offeringId" = ${offeringId}
    LIMIT 1
  `);

  let curriculumReady = false;
  if (binding[0]) {
    const pinned = binding[0];
    if (
      pinned.courseId !== offering.courseId ||
      pinned.yearLevel !== offering.programmeYear ||
      pinned.semester !== offering.semester ||
      !["Approved", "Active", "Superseded"].includes(pinned.curriculumStatus)
    ) {
      throw new OfferingActivationExceptionValidationError(
        "The pinned curriculum placement is inconsistent with this Offering and cannot authorize an exception",
      );
    }
    curriculumReady = true;
  } else {
    const placement = await programme().academicCalendar.resolveCoursePlacement(
      offering.course.programmeId,
      period.academicYearId,
      offering.programmeYear,
      offering.semester,
      offering.courseId,
    );
    if (placement.status === "course-not-placed") {
      throw new OfferingActivationExceptionValidationError(placement.message);
    }
    curriculumReady = placement.status === "confirmed";
  }

  let courseSpecReady = false;
  if (offering.courseSpecId) {
    if (
      !offering.courseSpec ||
      offering.courseSpec.courseId !== offering.courseId ||
      offering.courseSpec.reviewStatus !== "Approved"
    ) {
      throw new OfferingActivationExceptionValidationError(
        "The bound CourseSpec is not an Approved version for this course",
      );
    }
    courseSpecReady = true;
  }

  const missing: OfferingActivationExceptionMissingItem[] = [];
  if (!curriculumReady) missing.push("CURRICULUM");
  if (!courseSpecReady) missing.push("COURSE_SPEC");

  return {
    programmeId: offering.course.programmeId,
    offeringStatus: offering.status,
    missingItems: missing,
    teachingStart: period.teachingStart,
    teachingEnd: period.teachingEnd,
    academicCalendarRevision: period.revision,
  };
}

async function expireOverdue(
  offeringId: string,
  effectiveDate = today(),
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: OfferingActivationExceptionStatus;
        documentationDueDate: Date;
      }>
    >(Prisma.sql`
      SELECT "id", "status", "documentationDueDate"
      FROM offering_governance."OfferingActivationException"
      WHERE "offeringId" = ${offeringId}
        AND "status" IN ('PENDING', 'APPROVED')
        AND "documentationDueDate" < ${effectiveDate}::date
      ORDER BY "requestedAt" DESC
      LIMIT 1
      FOR UPDATE
    `);
    const current = rows[0];
    if (!current) return false;

    await tx.$executeRaw(Prisma.sql`
      UPDATE offering_governance."OfferingActivationException"
      SET
        "status" = 'EXPIRED'::offering_governance."OfferingActivationExceptionStatus",
        "expiredAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${current.id}
    `);

    if (current.status === "APPROVED") {
      await tx.offering.updateMany({
        where: { id: offeringId, status: "Active" },
        data: { status: "Planned" },
      });
    }

    await appendAudit(tx, {
      exceptionId: current.id,
      offeringId,
      actorId: null,
      action: "Expired",
      reason: "Documentation due date passed",
      details: { effectiveDate },
    });
    return true;
  });
}

async function snapshot(offeringId: string): Promise<OfferingActivationExceptionSnapshot> {
  await expireOverdue(offeringId);
  const readiness = await deriveReadiness(offeringId);
  const [currentRows, latestRows, history] = await Promise.all([
    exceptionRows(
      offeringId,
      Prisma.sql`exception."status" IN ('PENDING', 'APPROVED')`,
      1,
    ),
    exceptionRows(offeringId, Prisma.sql`TRUE`, 1),
    auditHistory(offeringId),
  ]);
  return {
    offeringId,
    offeringStatus: readiness.offeringStatus,
    current: currentRows[0] ? toView(currentRows[0]) : null,
    latest: latestRows[0] ? toView(latestRows[0]) : null,
    readiness: {
      normalReady: readiness.missingItems.length === 0,
      canRequest:
        readiness.offeringStatus === "Planned" && readiness.missingItems.length > 0,
      missingItems: readiness.missingItems,
      teachingStart: readiness.teachingStart,
      teachingEnd: readiness.teachingEnd,
      academicCalendarRevision: readiness.academicCalendarRevision,
    },
    history,
  };
}

export const offeringActivationExceptionService = {
  async programmeIdForOffering(offeringId: string): Promise<string> {
    const offering = await prisma.offering.findUnique({
      where: { id: offeringId },
      select: { course: { select: { programmeId: true } } },
    });
    if (!offering) {
      throw new OfferingActivationExceptionNotFoundError("Offering not found");
    }
    return offering.course.programmeId;
  },

  snapshot,

  async request(
    offeringId: string,
    input: RequestOfferingActivationExceptionInput,
    actorId: string,
  ): Promise<OfferingActivationExceptionSnapshot> {
    await expireOverdue(offeringId);
    const readiness = await deriveReadiness(offeringId);
    if (readiness.offeringStatus !== "Planned") {
      throw new OfferingActivationExceptionConflictError(
        "Only a Planned Offering can request an activation exception",
      );
    }
    if (readiness.missingItems.length === 0) {
      throw new OfferingActivationExceptionConflictError(
        "This Offering is academically ready and should use normal activation",
      );
    }
    if (
      input.documentationDueDate < readiness.teachingStart ||
      input.documentationDueDate > readiness.teachingEnd
    ) {
      throw new OfferingActivationExceptionValidationError(
        "Documentation due date must fall within the published teaching period",
      );
    }
    if (input.documentationDueDate < today()) {
      throw new OfferingActivationExceptionValidationError(
        "Documentation due date cannot already be expired",
      );
    }

    const exceptionId = crypto.randomUUID();
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO offering_governance."OfferingActivationException" (
            "id",
            "offeringId",
            "missingCurriculum",
            "missingCourseSpec",
            "reason",
            "documentationDueDate",
            "requestedByUserId"
          ) VALUES (
            ${exceptionId},
            ${offeringId},
            ${readiness.missingItems.includes("CURRICULUM")},
            ${readiness.missingItems.includes("COURSE_SPEC")},
            ${input.reason},
            ${input.documentationDueDate}::date,
            ${actorId}
          )
        `);
        await appendAudit(tx, {
          exceptionId,
          offeringId,
          actorId,
          action: "Requested",
          reason: input.reason,
          details: {
            missingItems: readiness.missingItems,
            documentationDueDate: input.documentationDueDate,
            academicCalendarRevision: readiness.academicCalendarRevision,
          },
        });
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2002" || code === "23505") {
        throw new OfferingActivationExceptionConflictError(
          "This Offering already has a pending or approved activation exception",
        );
      }
      throw error;
    }
    return snapshot(offeringId);
  },

  async review(
    offeringId: string,
    exceptionId: string,
    input: ReviewOfferingActivationExceptionInput,
    actorId: string,
  ): Promise<OfferingActivationExceptionSnapshot> {
    await expireOverdue(offeringId);
    const readiness = await deriveReadiness(offeringId);

    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ExceptionRow[]>(Prisma.sql`
        SELECT
          exception."id",
          exception."offeringId",
          exception."status",
          exception."missingCurriculum",
          exception."missingCourseSpec",
          exception."reason",
          exception."documentationDueDate",
          exception."requestedByUserId",
          requester."name" AS "requestedByName",
          exception."requestedAt",
          exception."reviewedByUserId",
          reviewer."name" AS "reviewedByName",
          exception."reviewedAt",
          exception."reviewNote",
          exception."resolvedAt",
          exception."revokedAt",
          exception."expiredAt"
        FROM offering_governance."OfferingActivationException" exception
        JOIN public."User" requester ON requester."id" = exception."requestedByUserId"
        LEFT JOIN public."User" reviewer ON reviewer."id" = exception."reviewedByUserId"
        WHERE exception."id" = ${exceptionId}
          AND exception."offeringId" = ${offeringId}
        LIMIT 1
        FOR UPDATE OF exception
      `);
      const current = rows[0];
      if (!current) {
        throw new OfferingActivationExceptionNotFoundError(
          "Activation exception request not found",
        );
      }
      if (current.status !== "PENDING") {
        throw new OfferingActivationExceptionConflictError(
          "Only a pending activation exception can be reviewed",
        );
      }

      if (input.decision === "Approve") {
        if (readiness.offeringStatus !== "Planned") {
          throw new OfferingActivationExceptionConflictError(
            "The Offering is no longer Planned",
          );
        }
        if (readiness.missingItems.length === 0) {
          throw new OfferingActivationExceptionConflictError(
            "Academic readiness is complete; activate this Offering normally instead",
          );
        }
        if (!sameMissingSnapshot(current, readiness.missingItems)) {
          throw new OfferingActivationExceptionConflictError(
            "Academic readiness changed after this request; create a fresh activation exception snapshot",
          );
        }

        await tx.$executeRaw(Prisma.sql`
          UPDATE offering_governance."OfferingActivationException"
          SET
            "status" = 'APPROVED'::offering_governance."OfferingActivationExceptionStatus",
            "reviewedByUserId" = ${actorId},
            "reviewedAt" = CURRENT_TIMESTAMP,
            "reviewNote" = ${input.note},
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${exceptionId}
        `);
        const activated = await tx.offering.updateMany({
          where: { id: offeringId, status: "Planned" },
          data: { status: "Active" },
        });
        if (activated.count !== 1) {
          throw new OfferingActivationExceptionConflictError(
            "The Offering changed while the exception was being approved",
          );
        }
        await appendAudit(tx, {
          exceptionId,
          offeringId,
          actorId,
          action: "Approved",
          reason: input.note,
          details: {
            missingItems: readiness.missingItems,
            documentationDueDate: dateOnly(current.documentationDueDate),
          },
        });
        return;
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE offering_governance."OfferingActivationException"
        SET
          "status" = 'REJECTED'::offering_governance."OfferingActivationExceptionStatus",
          "reviewedByUserId" = ${actorId},
          "reviewedAt" = CURRENT_TIMESTAMP,
          "reviewNote" = ${input.note},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${exceptionId}
      `);
      await appendAudit(tx, {
        exceptionId,
        offeringId,
        actorId,
        action: "Rejected",
        reason: input.note,
      });
    });

    return snapshot(offeringId);
  },

  async revoke(
    offeringId: string,
    exceptionId: string,
    reason: string,
    actorId: string,
  ): Promise<OfferingActivationExceptionSnapshot> {
    await expireOverdue(offeringId);
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: OfferingActivationExceptionStatus }>>(Prisma.sql`
        SELECT "id", "status"
        FROM offering_governance."OfferingActivationException"
        WHERE "id" = ${exceptionId} AND "offeringId" = ${offeringId}
        LIMIT 1
        FOR UPDATE
      `);
      const current = rows[0];
      if (!current) {
        throw new OfferingActivationExceptionNotFoundError(
          "Activation exception request not found",
        );
      }
      if (current.status !== "APPROVED") {
        throw new OfferingActivationExceptionConflictError(
          "Only an approved activation exception can be revoked",
        );
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE offering_governance."OfferingActivationException"
        SET
          "status" = 'REVOKED'::offering_governance."OfferingActivationExceptionStatus",
          "revokedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${exceptionId}
      `);
      await tx.offering.updateMany({
        where: { id: offeringId, status: "Active" },
        data: { status: "Planned" },
      });
      await appendAudit(tx, {
        exceptionId,
        offeringId,
        actorId,
        action: "Revoked",
        reason,
      });
    });
    return snapshot(offeringId);
  },

  async resolve(
    offeringId: string,
    exceptionId: string,
    note: string,
    actorId: string,
  ): Promise<OfferingActivationExceptionSnapshot> {
    await expireOverdue(offeringId);
    const readiness = await deriveReadiness(offeringId);
    if (readiness.missingItems.length > 0) {
      throw new OfferingActivationExceptionConflictError(
        "Curriculum confirmation and the exact Approved CourseSpec must be ready before resolving the exception",
      );
    }

    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: OfferingActivationExceptionStatus }>>(Prisma.sql`
        SELECT "id", "status"
        FROM offering_governance."OfferingActivationException"
        WHERE "id" = ${exceptionId} AND "offeringId" = ${offeringId}
        LIMIT 1
        FOR UPDATE
      `);
      const current = rows[0];
      if (!current) {
        throw new OfferingActivationExceptionNotFoundError(
          "Activation exception request not found",
        );
      }
      if (current.status !== "APPROVED") {
        throw new OfferingActivationExceptionConflictError(
          "Only an approved activation exception can be resolved",
        );
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE offering_governance."OfferingActivationException"
        SET
          "status" = 'RESOLVED'::offering_governance."OfferingActivationExceptionStatus",
          "resolvedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${exceptionId}
      `);
      await appendAudit(tx, {
        exceptionId,
        offeringId,
        actorId,
        action: "Resolved",
        reason: note,
        details: { canonicalAcademicReadiness: true },
      });
    });
    return snapshot(offeringId);
  },

  // Exported for focused DB regression coverage. Runtime callers normally use
  // snapshot(), which performs the same expiry reconciliation first.
  expireOverdue,
};
