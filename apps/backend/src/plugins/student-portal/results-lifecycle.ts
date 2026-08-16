import type {
  CourseDeliveryResultReview,
  CourseDeliveryStudentResultReview,
  PortalCloAchievement,
  PublishAssessmentResultsInput,
  SaveAssessmentResultInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { calculateCloEvidence, calculateCourseGrade } from "./assessment-calculation.ts";
import {
  PortalAccessError,
  PortalConflictError,
  PortalNotFoundError,
} from "./service.ts";

type ResultContext = Awaited<ReturnType<typeof resultContext>>;
type ReviewAssessment = {
  id: string;
  name: string;
  status: string;
  weight: number | null;
  cloCodes: string[];
};
type ReviewClo = {
  order: number;
  description: string;
  status: string;
};
type ReviewResult = {
  assessmentItemId: string;
  score: number;
  maxScore: number;
};

function achievementStatus(percentage: number | null): PortalCloAchievement["status"] {
  if (percentage === null) return "not-enough-evidence";
  if (percentage >= 70) return "achieved";
  if (percentage >= 50) return "developing";
  return "needs-attention";
}

export function canManageOfferingResults(
  authorId: string,
  programmeWide: boolean,
  lecturerId: string | null,
  coLecturerIds: string[],
): boolean {
  return programmeWide || lecturerId === authorId || coLecturerIds.includes(authorId);
}

export function buildStudentResultReview(input: {
  enrollmentId: string;
  student: { id: string; studentId: string; name: string };
  clos: ReviewClo[];
  assessments: ReviewAssessment[];
  results: ReviewResult[];
}): CourseDeliveryStudentResultReview {
  const grade = calculateCourseGrade(input.assessments, input.results);
  const assessmentById = new Map(input.assessments.map((item) => [item.id, item]));
  const achievements = input.clos
    .filter((clo) => clo.status === "Active")
    .map((clo) => {
      const code = `CLO${clo.order + 1}`;
      const calculation = calculateCloEvidence(code, input.assessments, input.results);
      return {
        code,
        description: clo.description,
        percentage: calculation.percentage,
        status: achievementStatus(calculation.percentage),
        evidenceCount: calculation.evidence.length,
        evidence: calculation.evidence.map((evidence) => ({
          assessmentItemId: evidence.assessmentItemId,
          assessmentName: assessmentById.get(evidence.assessmentItemId)?.name ?? "Assessment",
          rawPercentage: evidence.rawPercentage,
        })),
      } satisfies PortalCloAchievement;
    });
  const measured = achievements.flatMap((item) =>
    item.percentage === null ? [] : [item.percentage],
  );

  return {
    enrollmentId: input.enrollmentId,
    studentId: input.student.id,
    studentCode: input.student.studentId,
    studentName: input.student.name,
    totalCourseGrade: grade.totalGrade,
    courseGradeComplete: grade.complete,
    completedGradeWeight: grade.completedWeight,
    configuredGradeWeight: grade.configuredWeight,
    achievements,
    overallAchievement: measured.length
      ? Math.round(measured.reduce((sum, item) => sum + item, 0) / measured.length)
      : null,
  };
}

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

  if (!canManageOfferingResults(
    userId,
    programmeWide,
    enrollment.offering.lecturerId,
    enrollment.offering.coLecturers.map((item) => item.lecturerId),
  )) {
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
  async review(
    authorId: string,
    programmeWide: boolean,
    offeringId: string,
  ): Promise<CourseDeliveryResultReview> {
    const offering = await prisma.offering.findUnique({
      where: { id: offeringId },
      include: {
        coLecturers: true,
        course: {
          include: {
            specs: {
              where: { reviewStatus: "Approved" },
              orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
              take: 1,
              include: {
                clos: { orderBy: { order: "asc" } },
                assessmentItems: { orderBy: { order: "asc" } },
              },
            },
          },
        },
        enrollments: {
          include: {
            student: { select: { id: true, studentId: true, name: true } },
            results: true,
          },
          orderBy: { student: { name: "asc" } },
        },
      },
    });
    if (!offering) throw new PortalNotFoundError("Offering not found");

    if (!canManageOfferingResults(
      authorId,
      programmeWide,
      offering.lecturerId,
      offering.coLecturers.map((item) => item.lecturerId),
    )) {
      throw new PortalAccessError("You are not assigned to this offering");
    }

    const spec = offering.course.specs[0] ?? null;
    if (!spec) throw new PortalNotFoundError("Approved course specification not found");
    const assessments = spec.assessmentItems.filter((item) => item.status === "Active");

    return {
      offeringId: offering.id,
      courseSpecId: spec.id,
      courseCode: offering.course.code,
      courseTitle: offering.course.title,
      sectionCode: offering.sectionCode,
      rows: offering.enrollments.map((enrollment) =>
        buildStudentResultReview({
          enrollmentId: enrollment.id,
          student: enrollment.student,
          clos: spec.clos,
          assessments,
          // Lecturer review deliberately includes private draft rows. The endpoint
          // remains courses:write protected and is never reused by student reads.
          results: enrollment.results
            .filter((result) => result.courseSpecId === spec.id)
            .map((result) => ({
              assessmentItemId: result.assessmentItemId,
              score: result.score,
              maxScore: result.maxScore,
            })),
        }),
      ),
    };
  },

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

    if (!canManageOfferingResults(
      authorId,
      programmeWide,
      offering.lecturerId,
      offering.coLecturers.map((item) => item.lecturerId),
    )) {
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
