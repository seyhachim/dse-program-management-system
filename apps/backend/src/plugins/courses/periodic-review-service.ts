import { randomUUID } from "node:crypto";
import type {
  CourseSpecPeriodicReviewView,
  CourseSpecReviewDueView,
  CreateCourseSpecPeriodicReview,
  PeriodicReviewOutcome,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { courseSpecRevisionService } from "./revision-service.ts";

type PeriodicReviewRow = {
  id: string;
  courseSpecId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  versionMajor: number;
  versionMinor: number;
  reviewerId: string;
  reviewerName: string;
  scheduledReviewAt: Date;
  reviewedAt: Date;
  evidenceSummary: string;
  decisionReason: string;
  outcome: PeriodicReviewOutcome;
  createdRevisionId: string | null;
  createdRevisionMajor: number | null;
  createdRevisionMinor: number | null;
  nextReviewDueAt: Date;
  createdAt: Date;
};

type DueCandidate = {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  programmeId: string;
  courseSpecId: string;
  versionMajor: number;
  versionMinor: number;
  approvedAt: Date | null;
  baseNextReviewDueAt: Date | null;
  latestPeriodicReviewAt: Date | null;
  latestPeriodicOutcome: PeriodicReviewOutcome | null;
  periodicNextReviewDueAt: Date | null;
};

export class CourseSpecPeriodicReviewError extends Error {
  constructor(
    message: string,
    readonly code:
      | "COURSE_NOT_FOUND"
      | "SOURCE_NOT_APPROVED"
      | "REVIEWER_NOT_FOUND"
      | "INVALID_REVIEW_DATE",
  ) {
    super(message);
    this.name = "CourseSpecPeriodicReviewError";
  }
}

function toView(row: PeriodicReviewRow): CourseSpecPeriodicReviewView {
  return {
    id: row.id,
    courseSpecId: row.courseSpecId,
    courseId: row.courseId,
    courseCode: row.courseCode,
    courseTitle: row.courseTitle,
    versionMajor: row.versionMajor,
    versionMinor: row.versionMinor,
    reviewerId: row.reviewerId,
    reviewerName: row.reviewerName,
    scheduledReviewAt: row.scheduledReviewAt.toISOString(),
    reviewedAt: row.reviewedAt.toISOString(),
    evidenceSummary: row.evidenceSummary,
    decisionReason: row.decisionReason,
    outcome: row.outcome,
    createdRevisionId: row.createdRevisionId,
    createdRevisionVersion:
      row.createdRevisionMajor === null || row.createdRevisionMinor === null
        ? null
        : `${row.createdRevisionMajor}.${row.createdRevisionMinor}`,
    nextReviewDueAt: row.nextReviewDueAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

async function findReview(reviewId: string): Promise<CourseSpecPeriodicReviewView> {
  const rows = await prisma.$queryRaw<PeriodicReviewRow[]>`
    SELECT review.id,
           review."courseSpecId",
           spec."courseId",
           course.code AS "courseCode",
           course.title AS "courseTitle",
           spec."versionMajor",
           spec."versionMinor",
           review."reviewerId",
           reviewer.name AS "reviewerName",
           review."scheduledReviewAt",
           review."reviewedAt",
           review."evidenceSummary",
           review."decisionReason",
           review.outcome,
           review."createdRevisionId",
           revision."versionMajor" AS "createdRevisionMajor",
           revision."versionMinor" AS "createdRevisionMinor",
           review."nextReviewDueAt",
           review."createdAt"
    FROM "CourseSpecPeriodicReview" review
    JOIN "CourseSpec" spec ON spec.id = review."courseSpecId"
    JOIN "Course" course ON course.id = spec."courseId"
    JOIN "User" reviewer ON reviewer.id = review."reviewerId"
    LEFT JOIN "CourseSpec" revision ON revision.id = review."createdRevisionId"
    WHERE review.id = ${reviewId}
  `;
  const row = rows[0];
  if (!row) throw new CourseSpecPeriodicReviewError("Periodic review not found", "COURSE_NOT_FOUND");
  return toView(row);
}

function threeYearsAfter(date: Date): Date {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + 3);
  return result;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export const courseSpecPeriodicReviewService = {
  async create(
    courseId: string,
    reviewerId: string,
    input: CreateCourseSpecPeriodicReview,
  ): Promise<CourseSpecPeriodicReviewView> {
    const [course, reviewer, source] = await Promise.all([
      prisma.course.findUnique({ where: { id: courseId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: reviewerId }, select: { id: true } }),
      prisma.courseSpec.findFirst({
        where: { courseId, reviewStatus: "Approved" },
        orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
        select: {
          id: true,
          versionMajor: true,
          versionMinor: true,
          approvedAt: true,
        },
      }),
    ]);

    if (!course) throw new CourseSpecPeriodicReviewError("Course not found", "COURSE_NOT_FOUND");
    if (!reviewer) {
      throw new CourseSpecPeriodicReviewError("Periodic review reviewer not found", "REVIEWER_NOT_FOUND");
    }
    if (!source) {
      throw new CourseSpecPeriodicReviewError(
        "An approved course specification is required before recording a periodic review",
        "SOURCE_NOT_APPROVED",
      );
    }
    if (source.approvedAt && input.reviewedAt < source.approvedAt) {
      throw new CourseSpecPeriodicReviewError(
        "Periodic review date cannot precede approval of the reviewed version",
        "INVALID_REVIEW_DATE",
      );
    }

    let createdRevisionId: string | null = null;
    if (input.outcome !== "Reaffirmed") {
      const revision = await courseSpecRevisionService.createCourseSpecRevision({
        courseId,
        revisionType: input.outcome === "MajorRevision" ? "Major" : "Minor",
        triggers: ["ScheduledReview"],
        reason: input.decisionReason,
        changeSummary: input.evidenceSummary,
        initiatedById: reviewerId,
      });
      createdRevisionId = revision.id;
    }

    const reviewId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "CourseSpecPeriodicReview" (
        id,
        "courseSpecId",
        "reviewerId",
        "scheduledReviewAt",
        "reviewedAt",
        "evidenceSummary",
        "decisionReason",
        outcome,
        "createdRevisionId",
        "nextReviewDueAt"
      ) VALUES (
        ${reviewId}::uuid,
        ${source.id},
        ${reviewerId},
        ${input.scheduledReviewAt},
        ${input.reviewedAt},
        ${input.evidenceSummary.trim()},
        ${input.decisionReason.trim()},
        CAST(${input.outcome} AS "PeriodicReviewOutcome"),
        ${createdRevisionId},
        ${input.nextReviewDueAt}
      )
    `;

    return findReview(reviewId);
  },

  async listForCourse(courseId: string): Promise<CourseSpecPeriodicReviewView[]> {
    const rows = await prisma.$queryRaw<PeriodicReviewRow[]>`
      SELECT review.id,
             review."courseSpecId",
             spec."courseId",
             course.code AS "courseCode",
             course.title AS "courseTitle",
             spec."versionMajor",
             spec."versionMinor",
             review."reviewerId",
             reviewer.name AS "reviewerName",
             review."scheduledReviewAt",
             review."reviewedAt",
             review."evidenceSummary",
             review."decisionReason",
             review.outcome,
             review."createdRevisionId",
             revision."versionMajor" AS "createdRevisionMajor",
             revision."versionMinor" AS "createdRevisionMinor",
             review."nextReviewDueAt",
             review."createdAt"
      FROM "CourseSpecPeriodicReview" review
      JOIN "CourseSpec" spec ON spec.id = review."courseSpecId"
      JOIN "Course" course ON course.id = spec."courseId"
      JOIN "User" reviewer ON reviewer.id = review."reviewerId"
      LEFT JOIN "CourseSpec" revision ON revision.id = review."createdRevisionId"
      WHERE spec."courseId" = ${courseId}
      ORDER BY review."reviewedAt" DESC, review."createdAt" DESC, review.id DESC
    `;
    return rows.map(toView);
  },

  async listDue(options: {
    asOf: Date;
    includeFutureDays: number;
  }): Promise<CourseSpecReviewDueView[]> {
    const rows = await prisma.$queryRaw<DueCandidate[]>`
      WITH latest_approved AS (
        SELECT DISTINCT ON (spec."courseId")
               spec.id,
               spec."courseId",
               spec."versionMajor",
               spec."versionMinor",
               spec."approvedAt",
               spec."nextReviewDueAt"
        FROM "CourseSpec" spec
        WHERE spec."reviewStatus" = 'Approved'
        ORDER BY spec."courseId", spec."versionMajor" DESC, spec."versionMinor" DESC
      )
      SELECT course.id AS "courseId",
             course.code AS "courseCode",
             course.title AS "courseTitle",
             course."programmeId",
             spec.id AS "courseSpecId",
             spec."versionMajor",
             spec."versionMinor",
             spec."approvedAt",
             spec."nextReviewDueAt" AS "baseNextReviewDueAt",
             latest_review."reviewedAt" AS "latestPeriodicReviewAt",
             latest_review.outcome AS "latestPeriodicOutcome",
             latest_review."nextReviewDueAt" AS "periodicNextReviewDueAt"
      FROM latest_approved spec
      JOIN "Course" course ON course.id = spec."courseId"
      LEFT JOIN LATERAL (
        SELECT review."reviewedAt", review.outcome, review."nextReviewDueAt"
        FROM "CourseSpecPeriodicReview" review
        WHERE review."courseSpecId" = spec.id
        ORDER BY review."reviewedAt" DESC, review."createdAt" DESC, review.id DESC
        LIMIT 1
      ) latest_review ON TRUE
      ORDER BY course.code ASC, course.id ASC
    `;

    const asOfDay = startOfUtcDay(options.asOf);
    const futureLimit = new Date(asOfDay);
    futureLimit.setUTCDate(futureLimit.getUTCDate() + options.includeFutureDays);

    return rows.flatMap((row) => {
      const effectiveDue = row.periodicNextReviewDueAt
        ?? row.baseNextReviewDueAt
        ?? (row.approvedAt ? threeYearsAfter(row.approvedAt) : null);
      if (!effectiveDue) return [];
      const dueDay = startOfUtcDay(effectiveDue);
      if (dueDay > futureLimit) return [];
      const daysFromDue = Math.trunc((asOfDay.getTime() - dueDay.getTime()) / 86_400_000);
      return [{
        courseId: row.courseId,
        courseCode: row.courseCode,
        courseTitle: row.courseTitle,
        programmeId: row.programmeId,
        courseSpecId: row.courseSpecId,
        versionMajor: row.versionMajor,
        versionMinor: row.versionMinor,
        approvedAt: row.approvedAt?.toISOString() ?? null,
        effectiveReviewDueAt: effectiveDue.toISOString(),
        latestPeriodicReviewAt: row.latestPeriodicReviewAt?.toISOString() ?? null,
        latestPeriodicOutcome: row.latestPeriodicOutcome,
        status: dueDay < asOfDay ? "Overdue" as const : "Due" as const,
        daysFromDue,
      }];
    });
  },
};
