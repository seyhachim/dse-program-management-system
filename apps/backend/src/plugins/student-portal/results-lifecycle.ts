import type {
  PublishAssessmentResultsInput,
  SaveAssessmentResultInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import {
  PortalAccessError,
  PortalConflictError,
  PortalNotFoundError,
} from "./service.ts";

type ResultContext = Awaited<ReturnType<typeof resultContext>>;

async function resultContext(
  enrollmentId: string,
  userId: string,
  programmeWide: boolean,
) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      offering: {
        include: {
          coLecturers: true,
          course: {
            include: {
              specs: {
                where: { reviewStatus: "Approved" },
                orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
                take: 1,
                include: { assessmentItems: true },
              },
            },
          },
        },
      },
    },
  });
  if (!enrollment) throw new PortalNotFoundError("Enrollment not found");

  const assigned =
    enrollment.offering.lecturerId === userId ||
    enrollment.offering.coLecturers.some((item) => item.lecturerId === userId);
  if (!programmeWide && !assigned) {
    throw new PortalAccessError("You are not assigned to this offering");
  }

  const spec = enrollment.offering.course.specs[0] ?? null;
  if (!spec) throw new PortalNotFoundError("Approved course specification not found");
  return { enrollment, spec };
}

function assessmentFrom(
  context: ResultContext,
  assessmentItemId: string,
) {
  const assessment = context.spec.assessmentItems.find(
    (item) => item.id === assessmentItemId && item.status === "Active",
  );
  if (!assessment) throw new PortalNotFoundError("Active assessment not found");
  return assessment;
}

export function assertDraftWritable(publishedAt: Date | string | null | undefined) {
  if (publishedAt) {
    throw new PortalConflictError(
      "Published results are locked against ordinary edits. Use the controlled correction workflow.",
    );
  }
}

export function publicationReadiness(
  enrollmentIds: string[],
  results: Array<{
    enrollmentId: string;
    score: number;
    maxScore: number;
    publishedAt?: Date | string | null;
  }>,
) {
  const byEnrollment = new Map(results.map((result) => [result.enrollmentId, result]));
  const missingEnrollmentIds = enrollmentIds.filter((id) => !byEnrollment.has(id));
  const invalidEnrollmentIds = enrollmentIds.filter((id) => {
    const result = byEnrollment.get(id);
    return Boolean(
      result &&
        (!Number.isFinite(result.score) ||
          !Number.isFinite(result.maxScore) ||
          result.score < 0 ||
          result.maxScore <= 0 ||
          result.score > result.maxScore),
    );
  });
  const publishedEnrollmentIds = enrollmentIds.filter(
    (id) => Boolean(byEnrollment.get(id)?.publishedAt),
  );
  return {
    ready: missingEnrollmentIds.length === 0 && invalidEnrollmentIds.length === 0,
    missingEnrollmentIds,
    invalidEnrollmentIds,
    publishedEnrollmentIds,
  };
}

export const resultsLifecycleService = {
  async saveDraft(
    authorId: string,
    programmeWide: boolean,
    input: SaveAssessmentResultInput,
  ) {
    const context = await resultContext(input.enrollmentId, authorId, programmeWide);
    assessmentFrom(context, input.assessmentItemId);

    const key = {
      enrollmentId: context.enrollment.id,
      courseSpecId: context.spec.id,
      assessmentItemId: input.assessmentItemId,
    };
    const existing = await prisma.assessmentResult.findUnique({
      where: { enrollmentId_courseSpecId_assessmentItemId: key },
      select: { publishedAt: true },
    });
    assertDraftWritable(existing?.publishedAt);

    return prisma.assessmentResult.upsert({
      where: { enrollmentId_courseSpecId_assessmentItemId: key },
      update: {
        score: input.score,
        maxScore: input.maxScore,
        feedback: input.feedback,
        publishedAt: null,
      },
      create: {
        ...key,
        score: input.score,
        maxScore: input.maxScore,
        feedback: input.feedback,
        publishedAt: null,
      },
    });
  },

  async publishAssessment(
    authorId: string,
    programmeWide: boolean,
    input: PublishAssessmentResultsInput,
  ) {
    const offering = await prisma.offering.findUnique({
      where: { id: input.offeringId },
      include: {
        coLecturers: true,
        enrollments: { select: { id: true } },
        course: {
          include: {
            specs: {
              where: { reviewStatus: "Approved" },
              orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
              take: 1,
              include: { assessmentItems: true },
            },
          },
        },
      },
    });
    if (!offering) throw new PortalNotFoundError("Offering not found");

    const assigned =
      offering.lecturerId === authorId ||
      offering.coLecturers.some((item) => item.lecturerId === authorId);
    if (!programmeWide && !assigned) {
      throw new PortalAccessError("You are not assigned to this offering");
    }

    const spec = offering.course.specs[0] ?? null;
    if (!spec) throw new PortalNotFoundError("Approved course specification not found");
    const assessment = spec.assessmentItems.find(
      (item) => item.id === input.assessmentItemId && item.status === "Active",
    );
    if (!assessment) throw new PortalNotFoundError("Active assessment not found");
    if (!offering.enrollments.length) {
      throw new PortalConflictError("This offering has no enrolled students");
    }

    const enrollmentIds = offering.enrollments.map((item) => item.id);
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const results = await tx.assessmentResult.findMany({
        where: {
          enrollmentId: { in: enrollmentIds },
          courseSpecId: spec.id,
          assessmentItemId: input.assessmentItemId,
        },
        select: {
          id: true,
          enrollmentId: true,
          score: true,
          maxScore: true,
          publishedAt: true,
        },
      });
      const readiness = publicationReadiness(enrollmentIds, results);
      if (readiness.missingEnrollmentIds.length) {
        throw new PortalConflictError(
          `${readiness.missingEnrollmentIds.length} student result(s) are still missing. Save every mark before publishing this assessment.`,
        );
      }
      if (readiness.invalidEnrollmentIds.length) {
        throw new PortalConflictError(
          `${readiness.invalidEnrollmentIds.length} student result(s) contain invalid marks and must be corrected before publication.`,
        );
      }

      const unpublishedIds = results
        .filter((result) => !result.publishedAt)
        .map((result) => result.id);
      if (!unpublishedIds.length) {
        throw new PortalConflictError("All results for this assessment are already published and locked");
      }

      const updated = await tx.assessmentResult.updateMany({
        where: {
          id: { in: unpublishedIds },
          publishedAt: null,
        },
        data: { publishedAt: now },
      });
      if (updated.count !== unpublishedIds.length) {
        throw new PortalConflictError(
          "Result publication changed concurrently. Reload the markbook and review it before trying again.",
        );
      }
      return {
        offeringId: offering.id,
        assessmentItemId: assessment.id,
        publishedCount: updated.count,
        previouslyPublishedCount: readiness.publishedEnrollmentIds.length,
        publishedAt: now.toISOString(),
      };
    });
  },
};
