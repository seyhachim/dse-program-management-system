import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  OpenTeachingSlotClaimReviewResult,
  OpenTeachingSlotClaimStatus,
  OpenTeachingSlotClaimView,
  OpenTeachingSlotOfferingOption,
  OpenTeachingSlotStatus,
  OpenTeachingSlotStudentAssignment,
  OpenTeachingSlotView,
  ReviewOpenTeachingSlotClaim,
  SubmitOpenTeachingSlotClaim,
} from "@dse-pms/shared-types";
import type { AuthUser } from "../../core/auth/token.ts";
import { hasAnyRoleInProgramme } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";

const REVIEW_ROLES = ["admin", "program_coordinator"] as const;
const CAMBODIA_OFFSET = "+07:00";

export class OpenTeachingSlotNotFoundError extends Error {}
export class OpenTeachingSlotAuthorizationError extends Error {}
export class OpenTeachingSlotValidationError extends Error {}
export class OpenTeachingSlotConflictError extends Error {}

type SlotRow = {
  id: string;
  programmeId: string;
  status: OpenTeachingSlotStatus;
  sourceOccurrenceId: string;
  sourceRequesterId: string;
  sourceOfferingId: string;
  sourceMeetingId: string;
  sourceCourseId: string;
  sourceCourseCode: string;
  sourceCourseTitle: string;
  sectionCode: string;
  sourceTerm: string;
  sourceAcademicCalendarPeriodId: string | null;
  sessionDate: Date;
  scheduledDayOfWeek: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  scheduledRoom: string | null;
  scheduledActivityType: string;
};

type ClaimRow = {
  id: string;
  slotId: string;
  status: OpenTeachingSlotClaimStatus;
  claimantId: string;
  claimantName: string;
  targetOfferingId: string;
  targetCourseCode: string;
  targetCourseTitle: string;
  targetSectionCode: string;
  targetTerm: string;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewComment: string;
  requestedAt: Date;
  confirmedOccurrenceId: string | null;
  sessionDate: Date;
  scheduledStartTime: string;
  scheduledEndTime: string;
  scheduledRoom: string | null;
  sourceCourseCode: string;
  sourceCourseTitle: string;
  sourceSectionCode: string;
};

type OpenSlotCreationInput = {
  occurrenceId: string;
  programmeId: string;
  leaveRequestId: string;
  actorId: string;
  releaseForReuse: boolean;
};

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function scheduledInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${CAMBODIA_OFFSET}`);
}

function isExpired(date: Date, endTime: string, now = new Date()): boolean {
  return scheduledInstant(dateOnly(date), endTime).getTime() <= now.getTime();
}

function isManager(user: AuthUser, programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, [...REVIEW_ROLES], programmeId);
}

function sameStudents(left: string[], right: string[]): boolean {
  if (left.length === 0 || left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

async function slotRows(whereSql = "slot.\"status\" = 'OPEN'"): Promise<SlotRow[]> {
  return prisma.$queryRawUnsafe<SlotRow[]>(`
    SELECT slot."id", slot."programmeId", slot."status", slot."sourceOccurrenceId",
           leave."requesterId" AS "sourceRequesterId",
           occurrence."offeringId" AS "sourceOfferingId",
           occurrence."offeringMeetingId" AS "sourceMeetingId",
           source_offering."courseId" AS "sourceCourseId",
           source_course."code" AS "sourceCourseCode",
           source_course."title" AS "sourceCourseTitle",
           source_offering."sectionCode", source_offering."term" AS "sourceTerm",
           source_offering."academicCalendarPeriodId" AS "sourceAcademicCalendarPeriodId",
           occurrence."sessionDate", occurrence."scheduledDayOfWeek",
           occurrence."scheduledStartTime", occurrence."scheduledEndTime",
           occurrence."scheduledRoom", occurrence."scheduledActivityType"
    FROM "pms_attendance"."OpenTeachingSlot" slot
    JOIN "pms_attendance"."TeachingSessionOccurrence" occurrence
      ON occurrence."id" = slot."sourceOccurrenceId"
    JOIN "pms_attendance"."TeachingLeaveRequest" leave
      ON leave."id" = slot."sourceLeaveRequestId"
    JOIN "Offering" source_offering ON source_offering."id" = occurrence."offeringId"
    JOIN "Course" source_course ON source_course."id" = source_offering."courseId"
    WHERE ${whereSql}
    ORDER BY occurrence."sessionDate", occurrence."scheduledStartTime", slot."id"
  `);
}

async function slotRow(id: string): Promise<SlotRow> {
  const rows = await prisma.$queryRaw<SlotRow[]>`
    SELECT slot."id", slot."programmeId", slot."status", slot."sourceOccurrenceId",
           leave."requesterId" AS "sourceRequesterId",
           occurrence."offeringId" AS "sourceOfferingId",
           occurrence."offeringMeetingId" AS "sourceMeetingId",
           source_offering."courseId" AS "sourceCourseId",
           source_course."code" AS "sourceCourseCode",
           source_course."title" AS "sourceCourseTitle",
           source_offering."sectionCode", source_offering."term" AS "sourceTerm",
           source_offering."academicCalendarPeriodId" AS "sourceAcademicCalendarPeriodId",
           occurrence."sessionDate", occurrence."scheduledDayOfWeek",
           occurrence."scheduledStartTime", occurrence."scheduledEndTime",
           occurrence."scheduledRoom", occurrence."scheduledActivityType"
    FROM "pms_attendance"."OpenTeachingSlot" slot
    JOIN "pms_attendance"."TeachingSessionOccurrence" occurrence ON occurrence."id" = slot."sourceOccurrenceId"
    JOIN "pms_attendance"."TeachingLeaveRequest" leave ON leave."id" = slot."sourceLeaveRequestId"
    JOIN "Offering" source_offering ON source_offering."id" = occurrence."offeringId"
    JOIN "Course" source_course ON source_course."id" = source_offering."courseId"
    WHERE slot."id" = ${id}
    LIMIT 1
  `;
  if (!rows[0]) throw new OpenTeachingSlotNotFoundError("Open teaching slot not found");
  return rows[0];
}

async function sourceStudentIds(offeringId: string): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({
    where: { offeringId },
    select: { studentId: true },
    orderBy: { studentId: "asc" },
  });
  return rows.map((row) => row.studentId);
}

async function eligibleOfferingOptions(slot: SlotRow, userId: string): Promise<OpenTeachingSlotOfferingOption[]> {
  if (slot.sourceRequesterId === userId || isExpired(slot.sessionDate, slot.scheduledEndTime)) return [];
  const sourceStudents = await sourceStudentIds(slot.sourceOfferingId);
  if (sourceStudents.length === 0) return [];
  const offerings = await prisma.offering.findMany({
    where: {
      status: "Active",
      course: { programmeId: slot.programmeId },
      OR: [
        { lecturerId: userId },
        { coLecturers: { some: { lecturerId: userId } } },
      ],
    },
    include: {
      course: { select: { id: true, code: true, title: true } },
      enrollments: { select: { studentId: true }, orderBy: { studentId: "asc" } },
    },
    orderBy: [{ course: { code: "asc" } }, { sectionCode: "asc" }],
  });
  return offerings.flatMap((offering) => {
    const samePeriod = slot.sourceAcademicCalendarPeriodId && offering.academicCalendarPeriodId
      ? slot.sourceAcademicCalendarPeriodId === offering.academicCalendarPeriodId
      : slot.sourceTerm === offering.term;
    const eligible =
      offering.courseId !== slot.sourceCourseId &&
      offering.sectionCode === slot.sectionCode &&
      samePeriod &&
      sameStudents(sourceStudents, offering.enrollments.map((item) => item.studentId));
    return eligible ? [{
      offeringId: offering.id,
      courseCode: offering.course.code,
      courseTitle: offering.course.title,
      sectionCode: offering.sectionCode,
      term: offering.term,
    }] : [];
  });
}

async function claimRows(whereSql: string, params: unknown[] = []): Promise<ClaimRow[]> {
  return prisma.$queryRawUnsafe<ClaimRow[]>(`
    SELECT claim."id", claim."slotId", claim."status", claim."claimantId",
           claimant."name" AS "claimantName",
           claim."targetOfferingId", target_course."code" AS "targetCourseCode",
           target_course."title" AS "targetCourseTitle",
           target_offering."sectionCode" AS "targetSectionCode", target_offering."term" AS "targetTerm",
           claim."reviewedById", reviewer."name" AS "reviewedByName",
           claim."reviewedAt", claim."reviewComment", claim."requestedAt", claim."confirmedOccurrenceId",
           source_occurrence."sessionDate",
           source_occurrence."scheduledStartTime", source_occurrence."scheduledEndTime",
           source_occurrence."scheduledRoom",
           source_course."code" AS "sourceCourseCode", source_course."title" AS "sourceCourseTitle",
           source_offering."sectionCode" AS "sourceSectionCode"
    FROM "pms_attendance"."OpenTeachingSlotClaim" claim
    JOIN "pms_attendance"."OpenTeachingSlot" slot ON slot."id" = claim."slotId"
    JOIN "pms_attendance"."TeachingSessionOccurrence" source_occurrence
      ON source_occurrence."id" = slot."sourceOccurrenceId"
    JOIN "Offering" source_offering ON source_offering."id" = source_occurrence."offeringId"
    JOIN "Course" source_course ON source_course."id" = source_offering."courseId"
    JOIN "User" claimant ON claimant."id" = claim."claimantId"
    LEFT JOIN "User" reviewer ON reviewer."id" = claim."reviewedById"
    JOIN "Offering" target_offering ON target_offering."id" = claim."targetOfferingId"
    JOIN "Course" target_course ON target_course."id" = target_offering."courseId"
    WHERE ${whereSql}
    ORDER BY claim."requestedAt" DESC, claim."id" DESC
  `, ...params);
}

function toClaimView(row: ClaimRow): OpenTeachingSlotClaimView {
  return {
    id: row.id,
    slotId: row.slotId,
    status: row.status,
    claimant: { id: row.claimantId, name: row.claimantName },
    targetOffering: {
      offeringId: row.targetOfferingId,
      courseCode: row.targetCourseCode,
      courseTitle: row.targetCourseTitle,
      sectionCode: row.targetSectionCode,
      term: row.targetTerm,
    },
    slot: {
      sessionDate: dateOnly(row.sessionDate),
      startTime: row.scheduledStartTime,
      endTime: row.scheduledEndTime,
      room: row.scheduledRoom,
      sourceCourseCode: row.sourceCourseCode,
      sourceCourseTitle: row.sourceCourseTitle,
      sectionCode: row.sourceSectionCode,
    },
    reviewedBy: row.reviewedById && row.reviewedByName
      ? { id: row.reviewedById, name: row.reviewedByName }
      : null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewComment: row.reviewComment,
    requestedAt: row.requestedAt.toISOString(),
    confirmedOccurrenceId: row.confirmedOccurrenceId,
  };
}

async function readClaim(id: string): Promise<OpenTeachingSlotClaimView> {
  const rows = await claimRows('claim."id" = $1', [id]);
  if (!rows[0]) throw new OpenTeachingSlotNotFoundError("Open teaching slot claim not found");
  return toClaimView(rows[0]);
}

async function assertEligibleTarget(
  tx: Prisma.TransactionClient,
  slot: SlotRow,
  userId: string,
  targetOfferingId: string,
) {
  if (slot.sourceRequesterId === userId) {
    throw new OpenTeachingSlotAuthorizationError("The lecturer whose session was released cannot claim that same released slot");
  }
  const [target, sourceStudents] = await Promise.all([
    tx.offering.findUnique({
      where: { id: targetOfferingId },
      include: {
        course: { select: { id: true, programmeId: true, code: true, title: true } },
        coLecturers: { select: { lecturerId: true } },
        enrollments: { select: { studentId: true }, orderBy: { studentId: "asc" } },
      },
    }),
    tx.enrollment.findMany({
      where: { offeringId: slot.sourceOfferingId },
      select: { studentId: true },
      orderBy: { studentId: "asc" },
    }),
  ]);
  if (!target || target.status !== "Active") {
    throw new OpenTeachingSlotValidationError("The target course offering must be active");
  }
  const assigned = target.lecturerId === userId || target.coLecturers.some((item) => item.lecturerId === userId);
  if (!assigned) throw new OpenTeachingSlotAuthorizationError("You may claim a slot only for a course offering you teach");
  if (target.course.programmeId !== slot.programmeId) {
    throw new OpenTeachingSlotAuthorizationError("The target course offering belongs to another programme");
  }
  if (target.courseId === slot.sourceCourseId) {
    throw new OpenTeachingSlotValidationError("An open slot claim is for another course, not recovery of the released course");
  }
  if (target.sectionCode !== slot.sectionCode) {
    throw new OpenTeachingSlotValidationError("The target course must serve the same class section as the released slot");
  }
  const samePeriod = slot.sourceAcademicCalendarPeriodId && target.academicCalendarPeriodId
    ? slot.sourceAcademicCalendarPeriodId === target.academicCalendarPeriodId
    : slot.sourceTerm === target.term;
  if (!samePeriod) {
    throw new OpenTeachingSlotValidationError("The target course must be in the same academic period as the released slot");
  }
  if (!sameStudents(
    sourceStudents.map((item) => item.studentId),
    target.enrollments.map((item) => item.studentId),
  )) {
    throw new OpenTeachingSlotValidationError("The target course must serve the same enrolled class as the released slot");
  }
  return target;
}

async function assertNoScheduleConflict(
  tx: Prisma.TransactionClient,
  slot: SlotRow,
  claimantId: string,
): Promise<void> {
  const sourceStudents = await tx.enrollment.findMany({
    where: { offeringId: slot.sourceOfferingId },
    select: { studentId: true },
  });
  const studentIds = sourceStudents.map((item) => item.studentId);
  const recurring = await tx.offering.findMany({
    where: {
      status: "Active",
      meetings: {
        some: {
          dayOfWeek: slot.scheduledDayOfWeek as never,
          startTime: { lt: slot.scheduledEndTime },
          endTime: { gt: slot.scheduledStartTime },
        },
      },
      OR: [
        { lecturerId: claimantId },
        { coLecturers: { some: { lecturerId: claimantId } } },
        { enrollments: { some: { studentId: { in: studentIds } } } },
        ...(slot.scheduledRoom ? [{ meetings: { some: { room: slot.scheduledRoom } } }] : []),
      ],
    },
    include: { meetings: true },
  });
  const recurringConflict = recurring.some((offering) => offering.meetings.some((meeting) =>
    meeting.id !== slot.sourceMeetingId &&
    meeting.dayOfWeek === slot.scheduledDayOfWeek &&
    meeting.startTime < slot.scheduledEndTime &&
    meeting.endTime > slot.scheduledStartTime &&
    (
      offering.lecturerId === claimantId ||
      Boolean(slot.scheduledRoom && meeting.room === slot.scheduledRoom) ||
      offering.id !== slot.sourceOfferingId
    )
  ));
  if (recurringConflict) {
    throw new OpenTeachingSlotConflictError("This slot conflicts with an existing lecturer, class, or room schedule");
  }

  const assigned = await tx.$queryRaw<Array<{
    claimantId: string;
    targetOfferingId: string;
    scheduledRoom: string | null;
  }>>`
    SELECT claim."claimantId", claim."targetOfferingId", occurrence."scheduledRoom"
    FROM "pms_attendance"."OpenTeachingSlotClaim" claim
    JOIN "pms_attendance"."TeachingSessionOccurrence" occurrence
      ON occurrence."id" = claim."confirmedOccurrenceId"
    WHERE claim."status" = 'APPROVED'
      AND claim."slotId" <> ${slot.id}
      AND occurrence."sessionDate" = ${dateOnly(slot.sessionDate)}::date
      AND occurrence."scheduledStartTime" < ${slot.scheduledEndTime}
      AND occurrence."scheduledEndTime" > ${slot.scheduledStartTime}
  `;
  for (const other of assigned) {
    if (other.claimantId === claimantId) {
      throw new OpenTeachingSlotConflictError("You already have another assigned session at this time");
    }
    if (slot.scheduledRoom && other.scheduledRoom === slot.scheduledRoom) {
      throw new OpenTeachingSlotConflictError("The released room is already assigned to another session at this time");
    }
    const otherStudents = await tx.enrollment.findMany({
      where: { offeringId: other.targetOfferingId, studentId: { in: studentIds } },
      select: { id: true },
      take: 1,
    });
    if (otherStudents.length > 0) {
      throw new OpenTeachingSlotConflictError("The affected class already has another assigned session at this time");
    }
  }
}

export async function ensureOpenTeachingSlot(
  tx: Prisma.TransactionClient,
  input: OpenSlotCreationInput,
): Promise<void> {
  if (!input.releaseForReuse) return;
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "pms_attendance"."OpenTeachingSlot"
      ("id","programmeId","sourceOccurrenceId","sourceLeaveRequestId","status","openedAt","updatedAt")
    VALUES (
      ${input.occurrenceId},${input.programmeId},${input.occurrenceId},${input.leaveRequestId},
      'OPEN',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    )
    ON CONFLICT ("sourceOccurrenceId") DO NOTHING
    RETURNING "id"
  `;
  if (!inserted[0]) return;
  await tx.$executeRaw`
    INSERT INTO "pms_attendance"."OpenTeachingSlotAuditEvent"
      ("id","slotId","actorId","action","previousStatus","newStatus","details")
    VALUES (
      ${randomUUID()},${input.occurrenceId},${input.actorId},'OPENED',NULL,'OPEN',
      ${JSON.stringify({ sourceOccurrenceId: input.occurrenceId })}::jsonb
    )
  `;
}

export const openTeachingSlotService = {
  async board(user: AuthUser): Promise<OpenTeachingSlotView[]> {
    const rows = await slotRows("slot.\"status\" = 'OPEN'");
    const result: OpenTeachingSlotView[] = [];
    for (const row of rows) {
      const eligibleOfferings = await eligibleOfferingOptions(row, user.id);
      if (eligibleOfferings.length === 0) continue;
      result.push({
        id: row.id,
        programmeId: row.programmeId,
        status: row.status,
        sourceOccurrenceId: row.sourceOccurrenceId,
        sessionDate: dateOnly(row.sessionDate),
        startTime: row.scheduledStartTime,
        endTime: row.scheduledEndTime,
        room: row.scheduledRoom,
        activityType: row.scheduledActivityType,
        sourceCourseCode: row.sourceCourseCode,
        sourceCourseTitle: row.sourceCourseTitle,
        sectionCode: row.sectionCode,
        eligibleOfferings,
      });
    }
    return result;
  },

  async mine(user: AuthUser): Promise<OpenTeachingSlotClaimView[]> {
    const rows = await claimRows('claim."claimantId" = $1', [user.id]);
    return rows.map(toClaimView);
  },

  async claim(user: AuthUser, slotId: string, input: SubmitOpenTeachingSlotClaim): Promise<OpenTeachingSlotClaimView> {
    const claimId = randomUUID();
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<SlotRow[]>`
        SELECT slot."id", slot."programmeId", slot."status", slot."sourceOccurrenceId",
               leave."requesterId" AS "sourceRequesterId",
               occurrence."offeringId" AS "sourceOfferingId",
               occurrence."offeringMeetingId" AS "sourceMeetingId",
               source_offering."courseId" AS "sourceCourseId",
               source_course."code" AS "sourceCourseCode", source_course."title" AS "sourceCourseTitle",
               source_offering."sectionCode", source_offering."term" AS "sourceTerm",
               source_offering."academicCalendarPeriodId" AS "sourceAcademicCalendarPeriodId",
               occurrence."sessionDate", occurrence."scheduledDayOfWeek",
               occurrence."scheduledStartTime", occurrence."scheduledEndTime",
               occurrence."scheduledRoom", occurrence."scheduledActivityType"
        FROM "pms_attendance"."OpenTeachingSlot" slot
        JOIN "pms_attendance"."TeachingSessionOccurrence" occurrence ON occurrence."id" = slot."sourceOccurrenceId"
        JOIN "pms_attendance"."TeachingLeaveRequest" leave ON leave."id" = slot."sourceLeaveRequestId"
        JOIN "Offering" source_offering ON source_offering."id" = occurrence."offeringId"
        JOIN "Course" source_course ON source_course."id" = source_offering."courseId"
        WHERE slot."id" = ${slotId}
        FOR UPDATE OF slot
      `;
      const slot = rows[0];
      if (!slot) throw new OpenTeachingSlotNotFoundError("Open teaching slot not found");
      if (slot.status !== "OPEN") throw new OpenTeachingSlotConflictError("This teaching slot is no longer open");
      if (isExpired(slot.sessionDate, slot.scheduledEndTime)) {
        await tx.$executeRaw`UPDATE "pms_attendance"."OpenTeachingSlot" SET "status"='EXPIRED', "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${slot.id}`;
        throw new OpenTeachingSlotConflictError("This teaching slot has already ended");
      }
      await assertEligibleTarget(tx, slot, user.id, input.targetOfferingId);
      await assertNoScheduleConflict(tx, slot, user.id);
      await tx.$executeRaw`
        INSERT INTO "pms_attendance"."OpenTeachingSlotClaim"
          ("id","slotId","claimantId","targetOfferingId","status")
        VALUES (${claimId},${slot.id},${user.id},${input.targetOfferingId},'REQUESTED')
      `;
      await tx.$executeRaw`
        UPDATE "pms_attendance"."OpenTeachingSlot"
        SET "status"='CLAIM_REQUESTED', "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${slot.id}
      `;
      await tx.$executeRaw`
        INSERT INTO "pms_attendance"."OpenTeachingSlotAuditEvent"
          ("id","slotId","claimId","actorId","action","previousStatus","newStatus","details")
        VALUES (
          ${randomUUID()},${slot.id},${claimId},${user.id},'CLAIMED','OPEN','CLAIM_REQUESTED',
          ${JSON.stringify({ targetOfferingId: input.targetOfferingId })}::jsonb
        )
      `;
    });
    return readClaim(claimId);
  },

  async withdraw(user: AuthUser, claimId: string): Promise<OpenTeachingSlotClaimView> {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ slotId: string; claimantId: string; status: OpenTeachingSlotClaimStatus }>>`
        SELECT "slotId","claimantId","status" FROM "pms_attendance"."OpenTeachingSlotClaim"
        WHERE "id"=${claimId} FOR UPDATE
      `;
      const claim = rows[0];
      if (!claim) throw new OpenTeachingSlotNotFoundError("Open teaching slot claim not found");
      if (claim.claimantId !== user.id) throw new OpenTeachingSlotAuthorizationError("Only the claimant can withdraw this request");
      if (claim.status !== "REQUESTED") throw new OpenTeachingSlotConflictError("Only a pending claim can be withdrawn");
      await tx.$queryRaw`SELECT "id" FROM "pms_attendance"."OpenTeachingSlot" WHERE "id"=${claim.slotId} FOR UPDATE`;
      await tx.$executeRaw`UPDATE "pms_attendance"."OpenTeachingSlotClaim" SET "status"='WITHDRAWN', "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${claimId}`;
      await tx.$executeRaw`UPDATE "pms_attendance"."OpenTeachingSlot" SET "status"='OPEN', "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${claim.slotId}`;
      await tx.$executeRaw`
        INSERT INTO "pms_attendance"."OpenTeachingSlotAuditEvent"
          ("id","slotId","claimId","actorId","action","previousStatus","newStatus")
        VALUES (${randomUUID()},${claim.slotId},${claimId},${user.id},'WITHDRAWN','CLAIM_REQUESTED','OPEN')
      `;
    });
    return readClaim(claimId);
  },

  async reviewQueue(user: AuthUser): Promise<OpenTeachingSlotClaimView[]> {
    const globalAdmin = user.programmeRoles.some((item) => item.role === "admin" && item.programmeId === null);
    const programmeIds = [...new Set(user.programmeRoles
      .filter((item) => item.programmeId && REVIEW_ROLES.includes(item.role as typeof REVIEW_ROLES[number]))
      .map((item) => item.programmeId!))];
    if (!globalAdmin && programmeIds.length === 0) {
      throw new OpenTeachingSlotAuthorizationError("Only a programme administrator or coordinator can review open teaching slot claims");
    }
    const rows = globalAdmin
      ? await claimRows('claim."status" = \'REQUESTED\'')
      : await claimRows(
          'claim."status" = \'REQUESTED\' AND slot."programmeId" = ANY($1::text[])',
          [programmeIds],
        );
    return rows.map(toClaimView).reverse();
  },

  async review(user: AuthUser, claimId: string, input: ReviewOpenTeachingSlotClaim): Promise<OpenTeachingSlotClaimReviewResult> {
    const before = await readClaim(claimId);
    const slotBefore = await slotRow(before.slotId);
    if (!isManager(user, slotBefore.programmeId)) {
      throw new OpenTeachingSlotAuthorizationError("Only a programme administrator or coordinator can review this claim");
    }
    if (before.claimant.id === user.id) {
      throw new OpenTeachingSlotAuthorizationError("A lecturer cannot review their own open teaching slot claim");
    }
    let changed = false;
    await prisma.$transaction(async (tx) => {
      const claims = await tx.$queryRaw<Array<{
        slotId: string;
        claimantId: string;
        targetOfferingId: string;
        status: OpenTeachingSlotClaimStatus;
      }>>`
        SELECT "slotId","claimantId","targetOfferingId","status"
        FROM "pms_attendance"."OpenTeachingSlotClaim"
        WHERE "id"=${claimId} FOR UPDATE
      `;
      const claim = claims[0];
      if (!claim) throw new OpenTeachingSlotNotFoundError("Open teaching slot claim not found");
      const slots = await tx.$queryRaw<SlotRow[]>`
        SELECT slot."id", slot."programmeId", slot."status", slot."sourceOccurrenceId",
               leave."requesterId" AS "sourceRequesterId",
               occurrence."offeringId" AS "sourceOfferingId",
               occurrence."offeringMeetingId" AS "sourceMeetingId",
               source_offering."courseId" AS "sourceCourseId",
               source_course."code" AS "sourceCourseCode", source_course."title" AS "sourceCourseTitle",
               source_offering."sectionCode", source_offering."term" AS "sourceTerm",
               source_offering."academicCalendarPeriodId" AS "sourceAcademicCalendarPeriodId",
               occurrence."sessionDate", occurrence."scheduledDayOfWeek",
               occurrence."scheduledStartTime", occurrence."scheduledEndTime",
               occurrence."scheduledRoom", occurrence."scheduledActivityType"
        FROM "pms_attendance"."OpenTeachingSlot" slot
        JOIN "pms_attendance"."TeachingSessionOccurrence" occurrence ON occurrence."id" = slot."sourceOccurrenceId"
        JOIN "pms_attendance"."TeachingLeaveRequest" leave ON leave."id" = slot."sourceLeaveRequestId"
        JOIN "Offering" source_offering ON source_offering."id" = occurrence."offeringId"
        JOIN "Course" source_course ON source_course."id" = source_offering."courseId"
        WHERE slot."id"=${claim.slotId} FOR UPDATE OF slot
      `;
      const slot = slots[0];
      if (!slot) throw new OpenTeachingSlotNotFoundError("Open teaching slot not found");
      if (!isManager(user, slot.programmeId)) throw new OpenTeachingSlotAuthorizationError("You cannot review claims for this programme");
      if (claim.claimantId === user.id) throw new OpenTeachingSlotAuthorizationError("A lecturer cannot review their own open teaching slot claim");
      const finalStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      if (claim.status === finalStatus) return;
      if (claim.status !== "REQUESTED" || slot.status !== "CLAIM_REQUESTED") {
        throw new OpenTeachingSlotConflictError("This open teaching slot claim already has a final decision");
      }

      if (input.decision === "REJECT") {
        await tx.$executeRaw`
          UPDATE "pms_attendance"."OpenTeachingSlotClaim"
          SET "status"='REJECTED', "reviewedById"=${user.id}, "reviewedAt"=CURRENT_TIMESTAMP,
              "reviewComment"=${input.comment ?? ""}, "updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${claimId}
        `;
        await tx.$executeRaw`
          UPDATE "pms_attendance"."OpenTeachingSlot"
          SET "status"='OPEN', "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${slot.id}
        `;
        await tx.$executeRaw`
          INSERT INTO "pms_attendance"."OpenTeachingSlotAuditEvent"
            ("id","slotId","claimId","actorId","action","previousStatus","newStatus","details")
          VALUES (
            ${randomUUID()},${slot.id},${claimId},${user.id},'REJECTED','CLAIM_REQUESTED','OPEN',
            ${JSON.stringify({ comment: input.comment ?? "" })}::jsonb
          )
        `;
        changed = true;
        return;
      }

      if (isExpired(slot.sessionDate, slot.scheduledEndTime)) {
        throw new OpenTeachingSlotConflictError("This released teaching slot has already ended");
      }
      await assertEligibleTarget(tx, slot, claim.claimantId, claim.targetOfferingId);
      await assertNoScheduleConflict(tx, slot, claim.claimantId);
      const occurrenceId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "pms_attendance"."TeachingSessionOccurrence"
          ("id","offeringId","offeringMeetingId","sessionDate","scheduledDayOfWeek",
           "scheduledStartTime","scheduledEndTime","scheduledRoom","scheduledActivityType",
           "sourceOpenTeachingSlotId","createdAt","updatedAt")
        VALUES (
          ${occurrenceId},${claim.targetOfferingId},${randomUUID()},${dateOnly(slot.sessionDate)}::date,
          ${slot.scheduledDayOfWeek},${slot.scheduledStartTime},${slot.scheduledEndTime},
          ${slot.scheduledRoom},${slot.scheduledActivityType},${slot.id},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        )
      `;
      await tx.$executeRaw`
        UPDATE "pms_attendance"."OpenTeachingSlotClaim"
        SET "status"='APPROVED', "reviewedById"=${user.id}, "reviewedAt"=CURRENT_TIMESTAMP,
            "reviewComment"=${input.comment ?? ""}, "confirmedOccurrenceId"=${occurrenceId},
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${claimId}
      `;
      await tx.$executeRaw`
        UPDATE "pms_attendance"."OpenTeachingSlot"
        SET "status"='ASSIGNED', "assignedAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${slot.id}
      `;
      await tx.$executeRaw`
        INSERT INTO "pms_attendance"."OpenTeachingSlotAuditEvent"
          ("id","slotId","claimId","actorId","action","previousStatus","newStatus","details")
        VALUES (
          ${randomUUID()},${slot.id},${claimId},${user.id},'APPROVED','CLAIM_REQUESTED','ASSIGNED',
          ${JSON.stringify({ targetOfferingId: claim.targetOfferingId, confirmedOccurrenceId: occurrenceId, comment: input.comment ?? "" })}::jsonb
        )
      `;
      changed = true;
    });
    return { claim: await readClaim(claimId), changed };
  },

  async studentAssignments(userId: string): Promise<OpenTeachingSlotStudentAssignment[]> {
    const rows = await prisma.$queryRaw<Array<{
      occurrenceId: string;
      slotId: string;
      offeringId: string;
      courseCode: string;
      courseTitle: string;
      sectionCode: string;
      lecturerName: string;
      sessionDate: Date;
      startTime: string;
      endTime: string;
      room: string | null;
      activityType: string;
    }>>`
      SELECT occurrence."id" AS "occurrenceId", claim."slotId",
             occurrence."offeringId", course."code" AS "courseCode", course."title" AS "courseTitle",
             offering."sectionCode", lecturer."name" AS "lecturerName",
             occurrence."sessionDate", occurrence."scheduledStartTime" AS "startTime",
             occurrence."scheduledEndTime" AS "endTime", occurrence."scheduledRoom" AS "room",
             occurrence."scheduledActivityType" AS "activityType"
      FROM "pms_attendance"."OpenTeachingSlotClaim" claim
      JOIN "pms_attendance"."TeachingSessionOccurrence" occurrence
        ON occurrence."id" = claim."confirmedOccurrenceId"
      JOIN "Offering" offering ON offering."id" = occurrence."offeringId"
      JOIN "Course" course ON course."id" = offering."courseId"
      JOIN "User" lecturer ON lecturer."id" = claim."claimantId"
      JOIN "Student" student ON student."userId" = ${userId} AND student."status" = 'Active'
      JOIN "Enrollment" enrollment
        ON enrollment."studentId" = student."id" AND enrollment."offeringId" = occurrence."offeringId"
      WHERE claim."status" = 'APPROVED'
      ORDER BY occurrence."sessionDate", occurrence."scheduledStartTime", occurrence."id"
    `;
    return rows.map((row) => ({
      occurrenceId: row.occurrenceId,
      slotId: row.slotId,
      offeringId: row.offeringId,
      courseCode: row.courseCode,
      courseTitle: row.courseTitle,
      sectionCode: row.sectionCode,
      lecturerName: row.lecturerName,
      sessionDate: dateOnly(row.sessionDate),
      startTime: row.startTime,
      endTime: row.endTime,
      room: row.room,
      activityType: row.activityType,
      kind: "reused-slot",
    }));
  },
};
