import { randomUUID } from "node:crypto";
import type {
  CourseSpecPeriodicReviewOutcome,
  CourseSpecPeriodicReviewView,
  CreateCourseSpecPeriodicReviewInput,
  DueCourseSpecReviewView,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { courseSpecRevisionService } from "./revision-service.ts";
import { ensureCourseSpecThemeSnapshot } from "./document-theme-service.ts";

type ReviewRow = {
  id: string;
  courseSpecId: string;
  reviewerId: string;
  scheduledDueAt: Date | null;
  reviewedAt: Date;
  evidenceSummary: string;
  decisionReason: string;
  outcome: CourseSpecPeriodicReviewOutcome;
  createdRevisionId: string | null;
  nextReviewDueAt: Date | null;
  createdAt: Date;
};

type LatestReviewRow = {
  outcome: CourseSpecPeriodicReviewOutcome;
  nextReviewDueAt: Date | null;
};

type DueRow = {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  courseSpecId: string;
  versionMajor: number;
  versionMinor: number;
  effectiveDueAt: Date;
  daysOverdue: number;
};

export class CourseSpecPeriodicReviewError extends Error {
  constructor(
    message: string,
    readonly code:
      | "SOURCE_NOT_FOUND"
      | "SOURCE_NOT_APPROVED"
      | "SOURCE_NOT_CURRENT"
      | "REVIEWER_NOT_FOUND"
      | "FUTURE_REVIEW_DATE",
  ) {
    super(message);
    this.name = "CourseSpecPeriodicReviewError";
  }
}

function startOfUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addUtcYears(value: Date, years: number): Date {
  const next = new Date(value);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toView(row: ReviewRow): CourseSpecPeriodicReviewView {
  return {
    id: row.id,
    courseSpecId: row.courseSpecId,
    reviewerId: row.reviewerId,
    scheduledDueAt: isoDate(row.scheduledDueAt),
    reviewedAt: isoDate(row.reviewedAt)!,
    evidenceSummary: row.evidenceSummary,
    decisionReason: row.decisionReason,
    outcome: row.outcome,
    createdRevisionId: row.createdRevisionId,
    nextReviewDueAt: isoDate(row.nextReviewDueAt),
    createdAt: row.createdAt.toISOString(),
  };
}

async function latestReview(courseSpecId: string): Promise<LatestReviewRow | null> {
  const rows = await prisma.$queryRaw<LatestReviewRow[]>`
    SELECT "outcome", "nextReviewDueAt"
    FROM "course_spec_governance"."CourseSpecPeriodicReview"
    WHERE "courseSpecId" = ${courseSpecId}
    ORDER BY "reviewedAt" DESC, "createdAt" DESC, "id" DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function reviewById(id: string): Promise<CourseSpecPeriodicReviewView> {
  const rows = await prisma.$queryRaw<ReviewRow[]>`
    SELECT
      "id", "courseSpecId", "reviewerId", "scheduledDueAt", "reviewedAt",
      "evidenceSummary", "decisionReason", "outcome", "createdRevisionId",
      "nextReviewDueAt", "createdAt"
    FROM "course_spec_governance"."CourseSpecPeriodicReview"
    WHERE "id" = ${id}
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Periodic review was not persisted");
  }
  return toView(row);
}

async function insertReview(input: {
  id: string;
  courseSpecId: string;
  reviewerId: string;
  scheduledDueAt: Date | null;
  reviewedAt: Date;
  evidenceSummary: string;
  decisionReason: string;
  outcome: CourseSpecPeriodicReviewOutcome;
  createdRevisionId: string | null;
  nextReviewDueAt: Date | null;
}): Promise<CourseSpecPeriodicReviewView> {
  const rows = await prisma.$queryRaw<ReviewRow[]>`
    INSERT INTO "course_spec_governance"."CourseSpecPeriodicReview" (
      "id", "courseSpecId", "reviewerId", "scheduledDueAt", "reviewedAt",
      "evidenceSummary", "decisionReason", "outcome", "createdRevisionId",
      "nextReviewDueAt"
    ) VALUES (
      ${input.id}, ${input.courseSpecId}, ${input.reviewerId},
      ${input.scheduledDueAt}, ${input.reviewedAt}, ${input.evidenceSummary.trim()},
      ${input.decisionReason.trim()}, ${input.outcome}, ${input.createdRevisionId},
      ${input.nextReviewDueAt}
    )
    RETURNING
      "id", "courseSpecId", "reviewerId", "scheduledDueAt", "reviewedAt",
      "evidenceSummary", "decisionReason", "outcome", "createdRevisionId",
      "nextReviewDueAt", "createdAt"
  `;
  return toView(rows[0]!);
}

export const courseSpecPeriodicReviewService = {
  async create(
    courseId: string,
    reviewerId: string,
    input: CreateCourseSpecPeriodicReviewInput,
  ): Promise<CourseSpecPeriodicReviewView> {
    const reviewedAt = startOfUtcDate(input.reviewedAt);
    const today = new Date();
    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    if (reviewedAt > todayUtc) {
      throw new CourseSpecPeriodicReviewError(
        "Periodic review date cannot be in the future",
        "FUTURE_REVIEW_DATE",
      );
    }

    const [source, reviewer, currentApproved] = await Promise.all([
      prisma.courseSpec.findUnique({
        where: { id: input.courseSpecId },
        select: {
          id: true,
          courseId: true,
          reviewStatus: true,
          nextReviewDueAt: true,
        },
      }),
      prisma.user.findUnique({ where: { id: reviewerId }, select: { id: true } }),
      prisma.courseSpec.findFirst({
        where: { courseId, reviewStatus: "Approved" },
        orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
        select: { id: true },
      }),
    ]);

    if (!source || source.courseId !== courseId) {
      throw new CourseSpecPeriodicReviewError(
        "Course specification version not found for this course",
        "SOURCE_NOT_FOUND",
      );
    }
    if (source.reviewStatus !== "Approved") {
      throw new CourseSpecPeriodicReviewError(
        "Periodic review requires an approved course specification",
        "SOURCE_NOT_APPROVED",
      );
    }
    if (!currentApproved || currentApproved.id !== source.id) {
      throw new CourseSpecPeriodicReviewError(
        "Periodic review must target the current approved course specification",
        "SOURCE_NOT_CURRENT",
      );
    }
    if (!reviewer) {
      throw new CourseSpecPeriodicReviewError(
        "Reviewer does not exist",
        "REVIEWER_NOT_FOUND",
      );
    }

    const previousReview = await latestReview(source.id);
    const scheduledDueAt = previousReview
      ? previousReview.outcome === "Reaffirmed"
        ? previousReview.nextReviewDueAt
        : null
      : source.nextReviewDueAt;

    if (input.outcome === "Reaffirmed") {
      return insertReview({
        id: randomUUID(),
        courseSpecId: source.id,
        reviewerId,
        scheduledDueAt,
        reviewedAt,
        evidenceSummary: input.evidenceSummary,
        decisionReason: input.decisionReason,
        outcome: input.outcome,
        createdRevisionId: null,
        nextReviewDueAt: addUtcYears(reviewedAt, 3),
      });
    }

    const reviewId = randomUUID();
    const revisionType = input.outcome === "MajorRevision" ? "Major" : "Minor";
    const revision = await courseSpecRevisionService.createCourseSpecRevision({
      courseId,
      revisionType,
      triggers: ["ScheduledReview"],
      reason: input.decisionReason,
      changeSummary: input.changeSummary,
      initiatedById: reviewerId,
      periodicReview: {
        id: reviewId,
        sourceCourseSpecId: source.id,
        reviewerId,
        scheduledDueAt,
        reviewedAt,
        evidenceSummary: input.evidenceSummary,
        decisionReason: input.decisionReason,
        outcome: input.outcome,
      },
    });

    await ensureCourseSpecThemeSnapshot(courseId, revision.id);

    return reviewById(reviewId);
  },

  async list(courseId: string): Promise<CourseSpecPeriodicReviewView[]> {
    const rows = await prisma.$queryRaw<ReviewRow[]>`
      SELECT
        pr."id", pr."courseSpecId", pr."reviewerId", pr."scheduledDueAt",
        pr."reviewedAt", pr."evidenceSummary", pr."decisionReason", pr."outcome",
        pr."createdRevisionId", pr."nextReviewDueAt", pr."createdAt"
      FROM "course_spec_governance"."CourseSpecPeriodicReview" pr
      JOIN "CourseSpec" cs ON cs."id" = pr."courseSpecId"
      WHERE cs."courseId" = ${courseId}
      ORDER BY pr."reviewedAt" DESC, pr."createdAt" DESC, pr."id" DESC
    `;
    return rows.map(toView);
  },

  async listDue(
    programmeId: string,
    asOf: string,
  ): Promise<DueCourseSpecReviewView[]> {
    const asOfDate = startOfUtcDate(asOf);
    const rows = await prisma.$queryRaw<DueRow[]>`
      WITH current_approved AS (
        SELECT DISTINCT ON (cs."courseId")
          cs."id" AS "courseSpecId",
          cs."courseId",
          cs."versionMajor",
          cs."versionMinor",
          cs."nextReviewDueAt",
          c."code" AS "courseCode",
          c."title" AS "courseTitle"
        FROM "CourseSpec" cs
        JOIN "Course" c ON c."id" = cs."courseId"
        WHERE c."programmeId" = ${programmeId}
          AND cs."reviewStatus" = 'Approved'
        ORDER BY cs."courseId", cs."versionMajor" DESC, cs."versionMinor" DESC
      ), effective AS (
        SELECT
          ca.*,
          CASE
            WHEN pr."outcome" IN ('MinorRevision', 'MajorRevision') THEN NULL
            WHEN pr."outcome" = 'Reaffirmed' THEN pr."nextReviewDueAt"
            ELSE ca."nextReviewDueAt"::date
          END AS "effectiveDueAt"
        FROM current_approved ca
        LEFT JOIN LATERAL (
          SELECT r."outcome", r."nextReviewDueAt"
          FROM "course_spec_governance"."CourseSpecPeriodicReview" r
          WHERE r."courseSpecId" = ca."courseSpecId"
          ORDER BY r."reviewedAt" DESC, r."createdAt" DESC, r."id" DESC
          LIMIT 1
        ) pr ON TRUE
      )
      SELECT
        e."courseId",
        e."courseCode",
        e."courseTitle",
        e."courseSpecId",
        e."versionMajor",
        e."versionMinor",
        e."effectiveDueAt",
        GREATEST(0, (${asOfDate}::date - e."effectiveDueAt"::date))::int AS "daysOverdue"
      FROM effective e
      WHERE e."effectiveDueAt" IS NOT NULL
        AND e."effectiveDueAt" <= ${asOfDate}::date
      ORDER BY e."effectiveDueAt" ASC, e."courseCode" ASC
    `;

    return rows.map((row) => ({
      courseId: row.courseId,
      courseCode: row.courseCode,
      courseTitle: row.courseTitle,
      courseSpecId: row.courseSpecId,
      academicVersion: `${row.versionMajor}.${row.versionMinor}`,
      effectiveDueAt: isoDate(row.effectiveDueAt)!,
      daysOverdue: row.daysOverdue,
    }));
  },
};
