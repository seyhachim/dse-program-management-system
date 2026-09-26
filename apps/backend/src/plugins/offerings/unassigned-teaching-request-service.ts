import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  ReviewUnassignedTeachingRequest,
  UnassignedTeachingMeetingView,
  UnassignedTeachingRequestStatus,
  UnassignedTeachingRequestView,
  UnassignedTeachingReviewResult,
} from "@dse-pms/shared-types";
import type { AuthUser } from "../../core/auth/token.ts";
import { hasAnyRoleInProgramme } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";

const REVIEW_ROLES = ["admin", "program_coordinator"] as const;

export class UnassignedTeachingNotFoundError extends Error {}
export class UnassignedTeachingAuthorizationError extends Error {}
export class UnassignedTeachingConflictError extends Error {}
export class UnassignedTeachingValidationError extends Error {}

type MeetingRow = {
  meetingId: string;
  offeringId: string;
  programmeId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  sectionCode: string;
  offeringStatus: "Planned" | "Active" | "Completed";
  academicCalendarPeriodId: string | null;
  dayOfWeek: UnassignedTeachingMeetingView["dayOfWeek"];
  startTime: string;
  endTime: string;
  building: string | null;
  room: string | null;
  activityType: UnassignedTeachingMeetingView["activityType"];
  primaryLecturerId: string | null;
};

type RequestRow = MeetingRow & {
  id: string;
  status: UnassignedTeachingRequestStatus;
  requesterId: string;
  requesterName: string;
  requestedAt: Date;
  updatedAt: Date;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
};

type TelegramAssignmentRequestService = {
  notifications: {
    deliverUnassignedTeachingReviewers(input: {
      requestId: string;
      programmeId: string;
      requesterId: string;
      requesterName: string;
      courseCode: string;
      courseTitle: string;
      sectionCode: string;
      dayOfWeek: string;
      startTime: string;
      endTime: string;
      room: string | null;
    }): Promise<{ sent: number; failed: number; duplicate: number }>;
    deliverUnassignedTeachingRequester(input: {
      requestId: string;
      userId: string;
      status: "APPROVED" | "REJECTED" | "SUPERSEDED";
      courseCode: string;
      sectionCode: string;
      dayOfWeek: string;
      startTime: string;
      endTime: string;
    }): Promise<"sent" | "missing" | "failed" | "duplicate">;
  };
};

function telegram() {
  return registry.get<TelegramAssignmentRequestService>("telegram").service;
}

function isManager(user: AuthUser, programmeId: string): boolean {
  return hasAnyRoleInProgramme(user, [...REVIEW_ROLES], programmeId);
}

function toMeeting(row: MeetingRow): UnassignedTeachingMeetingView {
  return {
    meetingId: row.meetingId,
    offeringId: row.offeringId,
    programmeId: row.programmeId,
    course: {
      id: row.courseId,
      code: row.courseCode,
      title: row.courseTitle,
    },
    term: row.term,
    sectionCode: row.sectionCode,
    offeringStatus: row.offeringStatus,
    academicCalendarPeriodId: row.academicCalendarPeriodId,
    dayOfWeek: row.dayOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    building: row.building,
    room: row.room,
    activityType: row.activityType,
  };
}

function toView(row: RequestRow): UnassignedTeachingRequestView {
  return {
    id: row.id,
    status: row.status,
    requester: { id: row.requesterId, name: row.requesterName },
    meeting: toMeeting(row),
    requestedAt: row.requestedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviewedBy: row.reviewedById && row.reviewedByName
      ? { id: row.reviewedById, name: row.reviewedByName }
      : null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewComment: row.reviewComment,
  };
}

const requestSelect = `
  SELECT request."id", request."status", request."requesterId",
         requester."name" AS "requesterName", request."requestedAt",
         request."updatedAt", request."reviewedById",
         reviewer."name" AS "reviewedByName", request."reviewedAt",
         request."reviewComment",
         meeting."id" AS "meetingId", offering."id" AS "offeringId",
         course."programmeId", course."id" AS "courseId",
         course."code" AS "courseCode", course."title" AS "courseTitle",
         offering."term", offering."sectionCode", offering."status" AS "offeringStatus",
         offering."academicCalendarPeriodId", meeting."dayOfWeek",
         meeting."startTime", meeting."endTime", meeting."building",
         meeting."room", meeting."activityType",
         offering."lecturerId" AS "primaryLecturerId"
  FROM "pms_attendance"."OfferingMeetingTeachingRequest" request
  JOIN "OfferingMeeting" meeting ON meeting."id" = request."meetingId"
  JOIN "Offering" offering ON offering."id" = request."offeringId"
  JOIN "Course" course ON course."id" = offering."courseId"
  JOIN "User" requester ON requester."id" = request."requesterId"
  LEFT JOIN "User" reviewer ON reviewer."id" = request."reviewedById"
`;

async function readRequest(id: string): Promise<UnassignedTeachingRequestView> {
  const rows = await prisma.$queryRawUnsafe<RequestRow[]>(
    `${requestSelect} WHERE request."id" = $1 LIMIT 1`,
    id,
  );
  const row = rows[0];
  if (!row) throw new UnassignedTeachingNotFoundError("Teaching assignment request not found");
  return toView(row);
}

async function meetingForUpdate(
  tx: Prisma.TransactionClient,
  meetingId: string,
): Promise<MeetingRow> {
  const rows = await tx.$queryRaw<MeetingRow[]>`
    SELECT meeting."id" AS "meetingId", offering."id" AS "offeringId",
           course."programmeId", course."id" AS "courseId",
           course."code" AS "courseCode", course."title" AS "courseTitle",
           offering."term", offering."sectionCode", offering."status" AS "offeringStatus",
           offering."academicCalendarPeriodId", meeting."dayOfWeek",
           meeting."startTime", meeting."endTime", meeting."building",
           meeting."room", meeting."activityType",
           offering."lecturerId" AS "primaryLecturerId"
    FROM "OfferingMeeting" meeting
    JOIN "Offering" offering ON offering."id" = meeting."offeringId"
    JOIN "Course" course ON course."id" = offering."courseId"
    WHERE meeting."id" = ${meetingId}
    FOR UPDATE OF meeting
  `;
  const row = rows[0];
  if (!row) throw new UnassignedTeachingNotFoundError("Weekly teaching meeting not found");
  return row;
}

async function isMeetingAllocated(tx: Prisma.TransactionClient, meetingId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ assigned: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM "OfferingMeetingLecturer" assignment
      WHERE assignment."meetingId" = ${meetingId}
    ) AS "assigned"
  `;
  return Boolean(rows[0]?.assigned);
}

async function hasPersistedLecturerRole(
  tx: Prisma.TransactionClient,
  userId: string,
  programmeId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ eligible: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "UserRoleAssignment" assignment
      JOIN "Role" role ON role."id" = assignment."roleId"
      WHERE assignment."userId" = ${userId}
        AND role."slug" = 'lecturer'
        AND role."active" = TRUE
        AND (assignment."programmeId" IS NULL OR assignment."programmeId" = ${programmeId})
    ) AS "eligible"
  `;
  return Boolean(rows[0]?.eligible);
}

async function hasScheduleConflict(
  tx: Prisma.TransactionClient,
  userId: string,
  target: MeetingRow,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ conflict: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "OfferingMeetingLecturer" ownership
      JOIN "OfferingMeeting" meeting ON meeting."id" = ownership."meetingId"
      JOIN "Offering" offering ON offering."id" = meeting."offeringId"
      WHERE ownership."lecturerId" = ${userId}
        AND meeting."id" <> ${target.meetingId}
        AND offering."status" IN ('Planned','Active')
        AND meeting."dayOfWeek" = ${target.dayOfWeek}
        AND meeting."startTime" < ${target.endTime}
        AND meeting."endTime" > ${target.startTime}
        AND (
          (${target.academicCalendarPeriodId}::text IS NOT NULL
            AND offering."academicCalendarPeriodId" = ${target.academicCalendarPeriodId})
          OR
          (${target.academicCalendarPeriodId}::text IS NULL
            AND offering."academicCalendarPeriodId" IS NULL
            AND offering."term" = ${target.term})
        )
    ) AS "conflict"
  `;
  return Boolean(rows[0]?.conflict);
}

async function appendAudit(
  tx: Prisma.TransactionClient,
  input: {
    requestId: string;
    actorId: string;
    action: "SUBMITTED" | "APPROVED" | "REJECTED" | "SUPERSEDED";
    previousStatus: UnassignedTeachingRequestStatus | null;
    newStatus: UnassignedTeachingRequestStatus;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "pms_attendance"."OfferingMeetingTeachingRequestAuditEvent"
      ("id","requestId","actorId","action","previousStatus","newStatus","details")
    VALUES (
      ${randomUUID()}, ${input.requestId}, ${input.actorId}, ${input.action},
      ${input.previousStatus}, ${input.newStatus},
      ${input.details ? JSON.stringify(input.details) : null}::jsonb
    )
  `;
}

async function notifyReviewers(request: UnassignedTeachingRequestView): Promise<void> {
  try {
    await telegram().notifications.deliverUnassignedTeachingReviewers({
      requestId: request.id,
      programmeId: request.meeting.programmeId,
      requesterId: request.requester.id,
      requesterName: request.requester.name,
      courseCode: request.meeting.course.code,
      courseTitle: request.meeting.course.title,
      sectionCode: request.meeting.sectionCode,
      dayOfWeek: request.meeting.dayOfWeek,
      startTime: request.meeting.startTime,
      endTime: request.meeting.endTime,
      room: request.meeting.room,
    });
  } catch {
    // Telegram is advisory only. Never invalidate the authoritative PMS request.
  }
}

async function notifyRequester(request: UnassignedTeachingRequestView): Promise<void> {
  if (!["APPROVED", "REJECTED", "SUPERSEDED"].includes(request.status)) return;
  try {
    await telegram().notifications.deliverUnassignedTeachingRequester({
      requestId: request.id,
      userId: request.requester.id,
      status: request.status as "APPROVED" | "REJECTED" | "SUPERSEDED",
      courseCode: request.meeting.course.code,
      sectionCode: request.meeting.sectionCode,
      dayOfWeek: request.meeting.dayOfWeek,
      startTime: request.meeting.startTime,
      endTime: request.meeting.endTime,
    });
  } catch {
    // Notification failure is observable in Telegram delivery history and is non-authoritative.
  }
}

export const unassignedTeachingRequestService = {
  errorStatus(error: unknown): number | null {
    if (error instanceof UnassignedTeachingNotFoundError) return 404;
    if (error instanceof UnassignedTeachingAuthorizationError) return 403;
    if (error instanceof UnassignedTeachingConflictError) return 409;
    if (error instanceof UnassignedTeachingValidationError) return 400;
    return null;
  },

  async available(user: AuthUser): Promise<UnassignedTeachingMeetingView[]> {
    const rows = await prisma.$queryRaw<MeetingRow[]>`
      SELECT meeting."id" AS "meetingId", offering."id" AS "offeringId",
             course."programmeId", course."id" AS "courseId",
             course."code" AS "courseCode", course."title" AS "courseTitle",
             offering."term", offering."sectionCode", offering."status" AS "offeringStatus",
             offering."academicCalendarPeriodId", meeting."dayOfWeek",
             meeting."startTime", meeting."endTime", meeting."building",
             meeting."room", meeting."activityType",
             offering."lecturerId" AS "primaryLecturerId"
      FROM "OfferingMeeting" meeting
      JOIN "Offering" offering ON offering."id" = meeting."offeringId"
      JOIN "Course" course ON course."id" = offering."courseId"
      LEFT JOIN "AcademicCalendarPeriod" period ON period."id" = offering."academicCalendarPeriodId"
      WHERE offering."status" IN ('Planned','Active')
        AND (COALESCE(period."teachingEnd", offering."endDate") IS NULL
             OR COALESCE(period."teachingEnd", offering."endDate") >= CURRENT_DATE)
        AND NOT EXISTS (
          SELECT 1 FROM "OfferingMeetingLecturer" ownership
          WHERE ownership."meetingId" = meeting."id"
        )
        AND EXISTS (
          SELECT 1
          FROM "UserRoleAssignment" assignment
          JOIN "Role" role ON role."id" = assignment."roleId"
          WHERE assignment."userId" = ${user.id}
            AND role."slug" = 'lecturer'
            AND role."active" = TRUE
            AND (assignment."programmeId" IS NULL OR assignment."programmeId" = course."programmeId")
        )
      ORDER BY offering."term" DESC, course."code", offering."sectionCode",
               meeting."dayOfWeek", meeting."startTime"
    `;
    return rows.map(toMeeting);
  },

  async mine(user: AuthUser): Promise<UnassignedTeachingRequestView[]> {
    const rows = await prisma.$queryRawUnsafe<RequestRow[]>(
      `${requestSelect}
       WHERE request."requesterId" = $1
       ORDER BY request."requestedAt" DESC, request."id" DESC`,
      user.id,
    );
    return rows.map(toView);
  },

  async reviewQueue(user: AuthUser): Promise<UnassignedTeachingRequestView[]> {
    const rows = await prisma.$queryRawUnsafe<RequestRow[]>(
      `${requestSelect}
       WHERE request."status" = 'PENDING'
       ORDER BY request."requestedAt", request."id"`,
    );
    return rows.filter((row) => isManager(user, row.programmeId)).map(toView);
  },

  async getForReview(user: AuthUser, id: string): Promise<UnassignedTeachingRequestView> {
    const request = await readRequest(id);
    if (!isManager(user, request.meeting.programmeId)) {
      throw new UnassignedTeachingAuthorizationError("Only a programme administrator or coordinator can review this request");
    }
    if (request.requester.id === user.id) {
      throw new UnassignedTeachingAuthorizationError("A lecturer cannot review their own teaching assignment request");
    }
    return request;
  },

  async submit(user: AuthUser, meetingId: string): Promise<UnassignedTeachingRequestView> {
    const requestId = randomUUID();
    await prisma.$transaction(async (tx) => {
      const meeting = await meetingForUpdate(tx, meetingId);
      if (meeting.offeringStatus === "Completed") {
        throw new UnassignedTeachingConflictError("This class is no longer available for assignment");
      }
      if (!(await hasPersistedLecturerRole(tx, user.id, meeting.programmeId))) {
        throw new UnassignedTeachingAuthorizationError(
          "You can request only unassigned classes in your active lecturer programme",
        );
      }
      if (await isMeetingAllocated(tx, meetingId)) {
        throw new UnassignedTeachingConflictError("This weekly class already has an assigned lecturer");
      }
      if (await hasScheduleConflict(tx, user.id, meeting)) {
        throw new UnassignedTeachingConflictError("This class overlaps another weekly class already assigned to you");
      }
      const duplicate = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "pms_attendance"."OfferingMeetingTeachingRequest"
        WHERE "meetingId" = ${meetingId}
          AND "requesterId" = ${user.id}
          AND "status" = 'PENDING'
        LIMIT 1
      `;
      if (duplicate[0]) {
        throw new UnassignedTeachingConflictError("You already have a pending request for this weekly class");
      }

      await tx.$executeRaw`
        INSERT INTO "pms_attendance"."OfferingMeetingTeachingRequest"
          ("id","programmeId","offeringId","meetingId","requesterId","status")
        VALUES (
          ${requestId}, ${meeting.programmeId}, ${meeting.offeringId},
          ${meeting.meetingId}, ${user.id}, 'PENDING'
        )
      `;
      await appendAudit(tx, {
        requestId,
        actorId: user.id,
        action: "SUBMITTED",
        previousStatus: null,
        newStatus: "PENDING",
      });
    });

    const request = await readRequest(requestId);
    await notifyReviewers(request);
    return request;
  },

  async review(
    user: AuthUser,
    id: string,
    input: ReviewUnassignedTeachingRequest,
  ): Promise<UnassignedTeachingReviewResult> {
    const outcome = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<RequestRow[]>`
        SELECT request."id", request."status", request."requesterId",
               requester."name" AS "requesterName", request."requestedAt",
               request."updatedAt", request."reviewedById",
               reviewer."name" AS "reviewedByName", request."reviewedAt",
               request."reviewComment",
               meeting."id" AS "meetingId", offering."id" AS "offeringId",
               course."programmeId", course."id" AS "courseId",
               course."code" AS "courseCode", course."title" AS "courseTitle",
               offering."term", offering."sectionCode", offering."status" AS "offeringStatus",
               offering."academicCalendarPeriodId", meeting."dayOfWeek",
               meeting."startTime", meeting."endTime", meeting."building",
               meeting."room", meeting."activityType",
               offering."lecturerId" AS "primaryLecturerId"
        FROM "pms_attendance"."OfferingMeetingTeachingRequest" request
        JOIN "OfferingMeeting" meeting ON meeting."id" = request."meetingId"
        JOIN "Offering" offering ON offering."id" = request."offeringId"
        JOIN "Course" course ON course."id" = offering."courseId"
        JOIN "User" requester ON requester."id" = request."requesterId"
        LEFT JOIN "User" reviewer ON reviewer."id" = request."reviewedById"
        WHERE request."id" = ${id}
        FOR UPDATE OF request, meeting
      `;
      const request = rows[0];
      if (!request) throw new UnassignedTeachingNotFoundError("Teaching assignment request not found");
      if (!isManager(user, request.programmeId)) {
        throw new UnassignedTeachingAuthorizationError("Only a programme administrator or coordinator can review this request");
      }
      if (request.requesterId === user.id) {
        throw new UnassignedTeachingAuthorizationError("A lecturer cannot review their own teaching assignment request");
      }
      if (request.status !== "PENDING") return { changed: false, supersededIds: [] as string[] };

      if (input.decision === "REJECT") {
        await tx.$executeRaw`
          UPDATE "pms_attendance"."OfferingMeetingTeachingRequest"
          SET "status"='REJECTED', "reviewedById"=${user.id},
              "reviewedAt"=CURRENT_TIMESTAMP, "reviewComment"=${input.comment ?? null},
              "updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${id}
        `;
        await appendAudit(tx, {
          requestId: id,
          actorId: user.id,
          action: "REJECTED",
          previousStatus: "PENDING",
          newStatus: "REJECTED",
          details: input.comment ? { comment: input.comment } : undefined,
        });
        return { changed: true, supersededIds: [] as string[] };
      }

      if (request.offeringStatus === "Completed") {
        throw new UnassignedTeachingConflictError("This class is no longer available for assignment");
      }
      if (await isMeetingAllocated(tx, request.meetingId)) {
        throw new UnassignedTeachingConflictError("This weekly class has already been assigned");
      }
      if (!(await hasPersistedLecturerRole(tx, request.requesterId, request.programmeId))) {
        throw new UnassignedTeachingAuthorizationError("The requesting user is no longer an eligible lecturer for this programme");
      }
      if (await hasScheduleConflict(tx, request.requesterId, request)) {
        throw new UnassignedTeachingConflictError("The lecturer now has an overlapping weekly class");
      }

      if (request.primaryLecturerId !== request.requesterId) {
        await tx.$executeRaw`
          INSERT INTO "OfferingCoLecturer" ("offeringId","lecturerId")
          VALUES (${request.offeringId}, ${request.requesterId})
          ON CONFLICT ("offeringId","lecturerId") DO NOTHING
        `;
      }
      await tx.$executeRaw`
        INSERT INTO "OfferingMeetingLecturer" ("meetingId","lecturerId")
        VALUES (${request.meetingId}, ${request.requesterId})
      `;
      await tx.$executeRaw`
        UPDATE "pms_attendance"."OfferingMeetingTeachingRequest"
        SET "status"='APPROVED', "reviewedById"=${user.id},
            "reviewedAt"=CURRENT_TIMESTAMP, "reviewComment"=${input.comment ?? null},
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${id}
      `;
      await appendAudit(tx, {
        requestId: id,
        actorId: user.id,
        action: "APPROVED",
        previousStatus: "PENDING",
        newStatus: "APPROVED",
        details: input.comment ? { comment: input.comment } : undefined,
      });

      const competing = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "pms_attendance"."OfferingMeetingTeachingRequest"
        SET "status"='SUPERSEDED', "reviewedById"=${user.id},
            "reviewedAt"=CURRENT_TIMESTAMP,
            "reviewComment"='Another lecturer was approved for this weekly class.',
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "meetingId"=${request.meetingId}
          AND "id" <> ${id}
          AND "status"='PENDING'
        RETURNING "id"
      `;
      for (const item of competing) {
        await appendAudit(tx, {
          requestId: item.id,
          actorId: user.id,
          action: "SUPERSEDED",
          previousStatus: "PENDING",
          newStatus: "SUPERSEDED",
          details: { approvedRequestId: id },
        });
      }
      return { changed: true, supersededIds: competing.map((item) => item.id) };
    });

    const request = await readRequest(id);
    if (outcome.changed) {
      await notifyRequester(request);
      await Promise.allSettled(
        outcome.supersededIds.map(async (supersededId) => {
          const superseded = await readRequest(supersededId);
          await notifyRequester(superseded);
        }),
      );
    }
    return { request, changed: outcome.changed };
  },
};
