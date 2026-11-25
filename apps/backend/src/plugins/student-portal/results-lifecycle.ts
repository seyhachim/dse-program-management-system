import type {
  CorrectFinalizedAssessmentResultInput,
  CorrectFinalizedAssessmentResultResponse,
  CourseDeliveryResultReview,
  CourseDeliveryStudentResultReview,
  FinalizeAssessmentResultsInput,
  FinalizeAssessmentResultsResponse,
  PortalCloAchievement,
  PublishAssessmentResultsInput,
  PublishAssessmentResultsResponse,
  SaveAssessmentResultInput,
  SaveAssessmentCriterionScoresInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { groupAssessmentService } from "./group-assessment-results.ts";
import { canManageOfferingResults } from "./result-management-access.ts";
export { canManageOfferingResults } from "./result-management-access.ts";
import { markingSchemeCloEvidence } from "../../core/academic/marking-scheme-evidence.ts";
import { rubricContentHash } from "../../core/academic/rubric-context.ts";
import { summarizeMarkingSchemeScores } from "@dse-pms/shared-types";
import { calculateCloEvidence, calculateCourseGrade } from "./assessment-calculation.ts";
import {
  PortalAccessError,
  PortalConflictError,
  PortalNotFoundError,
} from "./service.ts";

// A friendly preflight for authorized callers. PostgreSQL is the authoritative
// interlock for races, direct SQL, imports, and alternative write paths.
async function assertLegacyGradingAvailable(db: Pick<typeof prisma, "$queryRaw">, courseSpecId: string, assessmentItemId: string) {
  const rows = await db.$queryRaw<Array<{ configured: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM exam_variant."ExamConfiguration"
      WHERE "courseSpecId"=${courseSpecId} AND "assessmentItemId"=${assessmentItemId}) AS configured
  `;
  if (rows[0]?.configured) throw new PortalConflictError("Multi-variant exam requires variant-aware grading; legacy grading is disabled");
}

type ResultContext = Awaited<ReturnType<typeof resultContext>>;
type ReviewAssessment = {
  id: string;
  name: string;
  status: string;
  weight: number | null;
  cloCodes: string[];
  rubric?: { instrumentKind: string } | null;
  criterionCloMappings?: Array<{ criterionId: string; rubricId: string; rubricContentHash: string; cloCode: string }>;
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
  criterionScores?: Array<{
    assessmentItemId: string; rubricId: string; criterionId: string; criterionName: string; rubricContentHash: string;
    score: number; maxScore: number; cloCodes: string[];
  }>;
};

function achievementStatus(percentage: number | null): PortalCloAchievement["status"] {
  if (percentage === null) return "not-enough-evidence";
  if (percentage >= 70) return "achieved";
  if (percentage >= 50) return "developing";
  return "needs-attention";
}

export function buildStudentResultReview(input: {
  enrollmentId: string;
  student: { id: string; studentId: string | null; name: string };
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
      const calculation = calculateCloEvidence(
        code,
        input.assessments,
        input.results,
        input.results.flatMap((result) => result.criterionScores ?? []),
      );
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
          source: evidence.source,
          ...(evidence.source === "criterion"
            ? {
                rubricId: evidence.rubricId,
                criterionId: evidence.criterionId,
                criterionName: evidence.criterionName,
                score: evidence.score,
                maxScore: evidence.maxScore,
                rubricContentHash: evidence.rubricContentHash,
              }
            : {}),
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
          courseSpec: {
            include: {
              assessmentItems: {
                include: {
                  criterionCloMappings: true,
                  rubric: { include: { levelRows: true, criterionRows: true } },
                },
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

  const spec = enrollment.offering.courseSpec ?? null;
  if (!spec) throw new PortalConflictError("Offering is not bound to an Approved CourseSpec version");
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

export function assertGenericFinalizedCorrectionMode(
  mode: "Individual" | "Group" | "GroupIndividual",
) {
  if (mode !== "Individual") {
    throw new PortalConflictError(
      "Group and Group + Individual results must be corrected through the group assessment source correction workflow",
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

export function finalizationReadiness(
  enrollmentIds: string[],
  results: Array<{
    enrollmentId: string;
    publishedAt?: Date | string | null;
    finalizedAt?: Date | string | null;
  }>,
) {
  const byEnrollment = new Map(results.map((result) => [result.enrollmentId, result]));
  const missingEnrollmentIds = enrollmentIds.filter((id) => !byEnrollment.has(id));
  const unpublishedEnrollmentIds = enrollmentIds.filter((id) => {
    const result = byEnrollment.get(id);
    return Boolean(result && !result.publishedAt);
  });
  const finalizedEnrollmentIds = enrollmentIds.filter(
    (id) => Boolean(byEnrollment.get(id)?.finalizedAt),
  );
  return {
    ready:
      missingEnrollmentIds.length === 0 &&
      unpublishedEnrollmentIds.length === 0 &&
      finalizedEnrollmentIds.length === 0,
    missingEnrollmentIds,
    unpublishedEnrollmentIds,
    finalizedEnrollmentIds,
  };
}

async function offeringLifecycleContext(
  offeringId: string,
  authorId: string,
  programmeWide: boolean,
  assessmentItemId: string,
) {
  const offering = await prisma.offering.findUnique({
    where: { id: offeringId },
    include: {
      coLecturers: true,
      enrollments: { select: { id: true } },
      courseSpec: { include: { assessmentItems: { include: { criterionCloMappings: true, rubric: { include: { levelRows: true, criterionRows: true } } } } } },
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

  const spec = offering.courseSpec ?? null;
  if (!spec) throw new PortalConflictError("Offering is not bound to an Approved CourseSpec version");
  const assessment = spec.assessmentItems.find(
    (item) => item.id === assessmentItemId && item.status === "Active",
  );
  if (!assessment) throw new PortalNotFoundError("Active assessment not found");
  if (!offering.enrollments.length) {
    throw new PortalConflictError("This offering has no enrolled students");
  }

  return { offering, spec, assessment };
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
        course: true,
        courseSpec: {
          include: {
            clos: { orderBy: { order: "asc" } },
            assessmentItems: {
              orderBy: { order: "asc" },
              include: { criterionCloMappings: true, rubric: { select: { instrumentKind: true } } },
            },
          },
        },
        enrollments: {
          include: {
            student: { select: { id: true, studentId: true, name: true } },
            results: { include: { criterionScores: true } },
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

    const spec = offering.courseSpec ?? null;
    if (!spec) throw new PortalConflictError("Offering is not bound to an Approved CourseSpec version");
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
              criterionScores: result.criterionScores.map((score) => ({
                assessmentItemId: result.assessmentItemId,
                rubricId: score.rubricId,
                criterionId: score.criterionId,
                criterionName: score.criterionName,
                rubricContentHash: score.rubricContentHash,
                score: score.score,
                maxScore: score.maxScore,
                cloCodes: assessments
                  .find((assessment) => assessment.id === result.assessmentItemId)
                  ?.criterionCloMappings
                  .filter((mapping) =>
                    mapping.rubricId === score.rubricId && mapping.criterionId === score.criterionId,
                  )
                  .map((mapping) => mapping.cloCode) ?? [],
              })),
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
    const assessment = assessmentFrom(context, input.assessmentItemId);
    await assertLegacyGradingAvailable(prisma, context.spec.id, assessment.id);
    if (assessment.mode !== "Individual") throw new PortalConflictError("Use the group assessment workspace for Group and Group + Individual scoring");
    if (assessment.rubric?.instrumentKind === "marking_scheme") throw new PortalConflictError("Enter actual question marks; the exam total is calculated automatically");

    const key = {
      enrollmentId: context.enrollment.id,
      courseSpecId: context.spec.id,
      assessmentItemId: input.assessmentItemId,
    };

    try {
      return await prisma.$transaction(async (tx) => {
      const existing = await tx.assessmentResult.findUnique({
        where: { enrollmentId_courseSpecId_assessmentItemId: key },
        select: { id: true, publishedAt: true, finalizedAt: true },
      });
      if (!existing) {
        return tx.assessmentResult.create({
          data: {
            ...key,
            score: input.score,
            maxScore: input.maxScore,
            feedback: input.feedback,
          },
        });
      }
      assertDraftWritable(existing.publishedAt ?? existing.finalizedAt);
      const updated = await tx.assessmentResult.updateMany({
        where: { id: existing.id, publishedAt: null, finalizedAt: null },
        data: { score: input.score, maxScore: input.maxScore, feedback: input.feedback },
      });
      if (updated.count !== 1) {
        throw new PortalConflictError(
          "Result state changed concurrently. Reload the markbook before saving again.",
        );
      }
      return tx.assessmentResult.findUniqueOrThrow({ where: { id: existing.id } });
      });
    } catch (error) {
      // A concurrent first-time configuration can win after the preflight.
      if (error instanceof Error && error.message.includes("Multi-variant exam requires variant-aware grading; legacy grading is disabled")) {
        throw new PortalConflictError("Multi-variant exam requires variant-aware grading; legacy grading is disabled");
      }
      throw error;
    }
  },

  async saveCriterionScores(
    authorId: string,
    programmeWide: boolean,
    input: SaveAssessmentCriterionScoresInput,
  ) {
    const context = await resultContext(input.enrollmentId, authorId, programmeWide);
    const assessment = assessmentFrom(context, input.assessmentItemId);
    await assertLegacyGradingAvailable(prisma, context.spec.id, assessment.id);
    if (assessment.mode !== "Individual") throw new PortalConflictError("Use the group assessment workspace for Group and Group + Individual criterion scoring");
    if (!assessment.rubricId || !assessment.rubric) {
      throw new PortalConflictError("This assessment has no linked rubric");
    }
    const key = {
      enrollmentId: context.enrollment.id,
      courseSpecId: context.spec.id,
      assessmentItemId: input.assessmentItemId,
    };

    const currentHash = rubricContentHash(assessment.rubric);
    const mappedHashes = new Set(assessment.criterionCloMappings.map((mapping) => mapping.rubricContentHash));
    if (mappedHashes.size > 1 || (mappedHashes.size === 1 && !mappedHashes.has(currentHash))) {
      throw new PortalConflictError(
        "The linked rubric changed after this course specification was configured. Revise the specification before criterion grading.",
      );
    }

    const criterionById = new Map(assessment.rubric.criterionRows.map((criterion) => [criterion.id, criterion]));
    const levelById = new Map(assessment.rubric.levelRows.map((level) => [level.id, level]));
    const isScheme = assessment.rubric.instrumentKind === "marking_scheme";
    const rubricMaxScore = Math.max(0, ...assessment.rubric.levelRows.map((level) => level.points));
    if (!isScheme && rubricMaxScore <= 0) throw new PortalConflictError("The linked rubric has no positive scoring scale");
    const seen = new Set<string>();
    const preparedRows = input.scores.map((inputScore) => {
      if (seen.has(inputScore.criterionId)) throw new PortalConflictError("Duplicate rubric criterion score");
      seen.add(inputScore.criterionId);
      const criterion = criterionById.get(inputScore.criterionId);
      if (!criterion) throw new PortalNotFoundError("Rubric criterion does not belong to this assessment's linked rubric");
      const maxScore = isScheme ? (criterion.maxPoints ?? 0) : rubricMaxScore;
      if (!Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(inputScore.score) || inputScore.score < 0 || inputScore.score > maxScore) throw new PortalConflictError("Invalid criterion or question score");
      if (isScheme && inputScore.rubricLevelId) throw new PortalConflictError("Marking schemes do not use rating levels");
      const level = inputScore.rubricLevelId ? levelById.get(inputScore.rubricLevelId) : undefined;
      if (inputScore.rubricLevelId && !level) throw new PortalNotFoundError("Rubric level does not belong to this assessment's linked rubric");
      if (level && Math.abs(level.points - inputScore.score) > 1e-9) {
        throw new PortalConflictError("Selected rubric level points do not match the criterion score");
      }
      return {
        rubricId: assessment.rubricId!,
        criterionId: criterion.id,
        criterionName: criterion.name,
        rubricContentHash: currentHash,
        score: inputScore.score,
        maxScore,
        rubricLevelId: level?.id ?? null,
        rubricLevelLabel: level?.label ?? null,
      };
    });

    if (isScheme) {
      const scheme = assessment.rubric;
      const questions = scheme.criterionRows.map((question) => ({ id: question.id, title: question.name, maxPoints: question.maxPoints ?? 0, markingGuidance: "" }));
      if (questions.some((question) => !assessment.criterionCloMappings.some((mapping) => mapping.criterionId === question.id && mapping.rubricContentHash === currentHash))) throw new PortalConflictError("The approved specification must map every question to a CLO");
      const summary = summarizeMarkingSchemeScores({ name: scheme.name, questions }, preparedRows.map((row) => ({ questionId: row.criterionId, score: row.score })));
      if (!summary.complete || summary.earnedPoints === null) throw new PortalConflictError("Enter every question mark before saving this student draft; blank marks are not zero");
      const earnedPoints = summary.earnedPoints;
      if (!assessment.cloCodes.length || !assessment.cloCodes.every((code) => markingSchemeCloEvidence(code, assessment.criterionCloMappings, preparedRows, { score: earnedPoints, maxScore: summary.maximumPoints }))) throw new PortalConflictError("The marking scheme mappings are incomplete or inconsistent; revise the specification before grading");
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${context.enrollment.offeringId} FOR UPDATE`;
        const currentOffering = await tx.offering.findUnique({ where: { id: context.enrollment.offeringId }, select: { courseSpecId: true } });
        const currentEnrollment = await tx.enrollment.findUnique({ where: { id: key.enrollmentId }, select: { offeringId: true } });
        if (currentOffering?.courseSpecId !== key.courseSpecId || currentEnrollment?.offeringId !== context.enrollment.offeringId) throw new PortalConflictError("Offering or enrollment changed; reload the markbook");
        const locked = await tx.$queryRaw<Array<{ id: string; publishedAt: Date | null; finalizedAt: Date | null }>>`
          SELECT "id", "publishedAt", "finalizedAt" FROM "AssessmentResult"
          WHERE "enrollmentId" = ${key.enrollmentId} AND "courseSpecId" = ${key.courseSpecId} AND "assessmentItemId" = ${key.assessmentItemId} FOR UPDATE
        `;
        const existing = locked[0];
        if (existing) assertDraftWritable(existing.publishedAt ?? existing.finalizedAt);
        const result = existing
          ? await tx.assessmentResult.update({ where: { id: existing.id }, data: { score: earnedPoints, maxScore: summary.maximumPoints, ...(input.feedback !== undefined ? { feedback: input.feedback } : {}) } })
          : await tx.assessmentResult.create({ data: { ...key, score: earnedPoints, maxScore: summary.maximumPoints, feedback: input.feedback ?? "" } });
        await tx.assessmentCriterionScore.deleteMany({ where: { assessmentResultId: result.id } });
        await tx.assessmentCriterionScore.createMany({ data: preparedRows.map((row) => ({ ...row, assessmentResultId: result.id })) });
        return { savedCount: preparedRows.length, rubricContentHash: currentHash };
      });
    }

    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{
        id: string;
        publishedAt: Date | null;
        finalizedAt: Date | null;
      }>>`
        SELECT "id", "publishedAt", "finalizedAt"
        FROM "AssessmentResult"
        WHERE "enrollmentId" = ${key.enrollmentId}
          AND "courseSpecId" = ${key.courseSpecId}
          AND "assessmentItemId" = ${key.assessmentItemId}
        FOR UPDATE
      `;
      const result = locked[0];
      if (!result) {
        throw new PortalConflictError("Save the whole-assessment draft before entering rubric criterion scores");
      }
      assertDraftWritable(result.publishedAt ?? result.finalizedAt);

      await tx.assessmentCriterionScore.deleteMany({ where: { assessmentResultId: result.id } });
      if (preparedRows.length > 0) {
        await tx.assessmentCriterionScore.createMany({
          data: preparedRows.map((row) => ({ ...row, assessmentResultId: result.id })),
        });
      }
      return { savedCount: preparedRows.length, rubricContentHash: currentHash };
    });
  },

  async publishAssessment(
    authorId: string,
    programmeWide: boolean,
    input: PublishAssessmentResultsInput,
  ): Promise<PublishAssessmentResultsResponse> {
    if (await groupAssessmentService.modeFor(authorId, programmeWide, input) !== "Individual") {
      return groupAssessmentService.publishAssessment(authorId, programmeWide, input);
    }
    const { offering, spec, assessment } = await offeringLifecycleContext(
      input.offeringId,
      authorId,
      programmeWide,
      input.assessmentItemId,
    );
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offering.id} FOR UPDATE`;
      await assertLegacyGradingAvailable(tx, spec.id, assessment.id);
      const currentEnrollments = await tx.enrollment.findMany({
        where: { offeringId: offering.id },
        select: { id: true },
      });
      const enrollmentIds = currentEnrollments.map((item) => item.id);
      if (!enrollmentIds.length) {
        throw new PortalConflictError("This offering has no enrolled students");
      }

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
          criterionScores: true,
        },
      });
      if (assessment.rubric?.instrumentKind === "marking_scheme") {
        const scheme = assessment.rubric;
        const hash = rubricContentHash(scheme);
        const questions = scheme.criterionRows;
        const maxima = questions.reduce((sum, question) => sum + (question.maxPoints ?? 0), 0);
        const valid = questions.length > 0 && assessment.cloCodes.length > 0 && results.every((result) => {
          const rows = result.criterionScores;
          return assessment.cloCodes.every((code) => markingSchemeCloEvidence(code, assessment.criterionCloMappings, rows, result)) && rows.length === questions.length && questions.every((question) => rows.some((row) => row.criterionId === question.id && row.rubricId === scheme.id && row.rubricContentHash === hash && row.maxScore === question.maxPoints && row.score >= 0 && row.score <= row.maxScore && Number.isFinite(row.score))) && Math.abs(result.maxScore - maxima) < 1e-9 && Math.abs(result.score - rows.reduce((sum, row) => sum + row.score, 0)) < 1e-9;
        });
        if (!valid) throw new PortalConflictError("Every marking scheme result must match complete question scores before publication");
      }
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
          finalizedAt: null,
        },
        data: { publishedAt: now, publishedById: authorId },
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
        publishedById: authorId,
      };
    });
  },

  async finalizeAssessment(
    authorId: string,
    programmeWide: boolean,
    input: FinalizeAssessmentResultsInput,
  ): Promise<FinalizeAssessmentResultsResponse> {
    if (await groupAssessmentService.modeFor(authorId, programmeWide, input) !== "Individual") {
      return groupAssessmentService.finalizeAssessment(authorId, programmeWide, input);
    }
    const { offering, spec, assessment } = await offeringLifecycleContext(
      input.offeringId,
      authorId,
      programmeWide,
      input.assessmentItemId,
    );
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offering.id} FOR UPDATE`;
      await assertLegacyGradingAvailable(tx, spec.id, assessment.id);
      const currentEnrollments = await tx.enrollment.findMany({
        where: { offeringId: offering.id },
        select: { id: true },
      });
      const enrollmentIds = currentEnrollments.map((item) => item.id);
      if (!enrollmentIds.length) {
        throw new PortalConflictError("This offering has no enrolled students");
      }

      const results = await tx.assessmentResult.findMany({
        where: {
          enrollmentId: { in: enrollmentIds },
          courseSpecId: spec.id,
          assessmentItemId: input.assessmentItemId,
        },
        select: {
          id: true,
          enrollmentId: true,
          publishedAt: true,
          finalizedAt: true,
        },
      });
      const readiness = finalizationReadiness(enrollmentIds, results);
      if (readiness.missingEnrollmentIds.length) {
        throw new PortalConflictError(
          `${readiness.missingEnrollmentIds.length} student result(s) are missing and cannot be finalized.`,
        );
      }
      if (readiness.unpublishedEnrollmentIds.length) {
        throw new PortalConflictError(
          `${readiness.unpublishedEnrollmentIds.length} student result(s) must be published before finalization.`,
        );
      }
      if (readiness.finalizedEnrollmentIds.length) {
        throw new PortalConflictError(
          "This assessment contains already-finalized results. Reload the result set before continuing.",
        );
      }

      const resultIds = results.map((result) => result.id);
      const updated = await tx.assessmentResult.updateMany({
        where: {
          id: { in: resultIds },
          publishedAt: { not: null },
          finalizedAt: null,
        },
        data: { finalizedAt: now, finalizedById: authorId },
      });
      if (updated.count !== resultIds.length) {
        throw new PortalConflictError(
          "Result finalization changed concurrently. Reload the result set and review it before trying again.",
        );
      }

      return {
        offeringId: offering.id,
        assessmentItemId: assessment.id,
        finalizedCount: updated.count,
        finalizedAt: now.toISOString(),
        finalizedById: authorId,
      };
    });
  },

  async correctFinalized(
    authorId: string,
    programmeWide: boolean,
    input: CorrectFinalizedAssessmentResultInput,
  ): Promise<CorrectFinalizedAssessmentResultResponse> {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "AssessmentResult"
        WHERE "id" = ${input.assessmentResultId}
        FOR UPDATE
      `;
      if (!locked.length) throw new PortalNotFoundError("Assessment result not found");

      const result = await tx.assessmentResult.findUnique({
        where: { id: input.assessmentResultId },
        include: {
          criterionScores: true,
          enrollment: {
            include: {
              offering: {
                include: {
                  coLecturers: true,
                  courseSpec: {
                    select: {
                      id: true,
                      assessmentItems: { include: { criterionCloMappings: true, rubric: { include: { levelRows: true, criterionRows: true } } } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!result) throw new PortalNotFoundError("Assessment result not found");

      if (!canManageOfferingResults(
        authorId,
        programmeWide,
        result.enrollment.offering.lecturerId,
        result.enrollment.offering.coLecturers.map((item) => item.lecturerId),
      )) {
        throw new PortalAccessError("You are not assigned to this offering");
      }
      if (!result.finalizedAt || !result.finalizedById || !result.publishedAt) {
        throw new PortalConflictError("Only finalized results can use the controlled correction workflow");
      }

      const spec = result.enrollment.offering.courseSpec;
      if (!spec || spec.id !== result.courseSpecId) {
        throw new PortalConflictError(
          "Finalized result does not match the Offering's bound CourseSpec version.",
        );
      }
      const assessment = spec.assessmentItems.find((item) => item.id === result.assessmentItemId);
      if (!assessment) {
        throw new PortalConflictError(
          "Finalized result does not match the Offering's bound CourseSpec assessment.",
        );
      }
      await assertLegacyGradingAvailable(tx, spec.id, assessment.id);
      assertGenericFinalizedCorrectionMode(assessment.mode);
      const isScheme = assessment.rubric?.instrumentKind === "marking_scheme";
      if (isScheme !== Boolean(input.questionScores)) throw new PortalConflictError(isScheme ? "Correct the actual question marks, not the exam total" : "Question corrections are only for marking schemes");
      if (!input.reason.trim()) throw new PortalConflictError("A correction reason is required");

      const expectedUpdatedAt = new Date(input.expectedUpdatedAt).toISOString();
      if (result.updatedAt.toISOString() !== expectedUpdatedAt) {
        throw new PortalConflictError(
          "This finalized result changed after you loaded it. Reload the result before applying a correction.",
        );
      }
      let score = input.score;
      let maxScore = input.maxScore;
      const questionChanges: Array<{ scoreId: string; criterionId: string; criterionName: string; rubricId: string; rubricContentHash: string; beforeScore: number; afterScore: number; maxScore: number }> = [];
      if (isScheme && assessment.rubric && input.questionScores) {
        const hash = rubricContentHash(assessment.rubric);
        const questions = assessment.rubric.criterionRows;
        const existing = result.criterionScores;
        const proposed = new Map(input.questionScores.map((row) => [row.criterionId, row.score]));
        if (proposed.size !== input.questionScores.length || proposed.size !== questions.length || existing.length !== questions.length ||
            !assessment.cloCodes.length || !assessment.cloCodes.every((code) => markingSchemeCloEvidence(code, assessment.criterionCloMappings, existing, result))) {
          throw new PortalConflictError("The finalized question evidence or proposed marks are incomplete");
        }
        const next = questions.map((question) => {
          const row = existing.find((item) => item.criterionId === question.id && item.rubricId === assessment.rubricId && item.rubricContentHash === hash);
          const value = proposed.get(question.id);
          if (!row || row.maxScore !== question.maxPoints || value === undefined || !Number.isFinite(value) || value < 0 || value > row.maxScore) throw new PortalConflictError("Invalid question mark or instrument version");
          if (row.score !== value) questionChanges.push({ scoreId: row.id, criterionId: row.criterionId, criterionName: row.criterionName, rubricId: row.rubricId, rubricContentHash: row.rubricContentHash, beforeScore: row.score, afterScore: value, maxScore: row.maxScore });
          return { ...row, score: value };
        });
        score = next.reduce((sum, row) => sum + row.score, 0);
        maxScore = next.reduce((sum, row) => sum + row.maxScore, 0);
        if (Math.abs(score - input.score) > 1e-9 || Math.abs(maxScore - input.maxScore) > 1e-9 || Math.abs(maxScore - result.maxScore) > 1e-9 ||
            !assessment.cloCodes.every((code) => markingSchemeCloEvidence(code, assessment.criterionCloMappings, next, { score, maxScore }))) {
          throw new PortalConflictError("The corrected exam total must match its question marks and fixed maximum");
        }
      }
      if (
        questionChanges.length === 0 &&
        result.score === score &&
        result.maxScore === maxScore &&
        result.feedback === input.feedback
      ) {
        throw new PortalConflictError("The correction must change the score, maximum score, or feedback");
      }

      const originalProvenance = {
        publishedAt: result.publishedAt,
        publishedById: result.publishedById,
        finalizedAt: result.finalizedAt,
        finalizedById: result.finalizedById,
      };
      const correctedAt = new Date();
      const correction = await tx.assessmentResultCorrection.create({
        data: {
          assessmentResultId: result.id,
          beforeScore: result.score,
          beforeMaxScore: result.maxScore,
          beforeFeedback: result.feedback,
          afterScore: score,
          afterMaxScore: maxScore,
          questionChanges,
          afterFeedback: input.feedback,
          reason: input.reason,
          correctedById: authorId,
          createdAt: correctedAt,
        },
      });
      await tx.$queryRaw`SELECT set_config('dse.result_correction_id', ${correction.id}, true)`;
      for (const change of questionChanges) {
        await tx.assessmentCriterionScore.update({ where: { id: change.scoreId }, data: { score: change.afterScore } });
      }
      const updated = await tx.assessmentResult.update({
        where: { id: result.id },
        data: { score, maxScore, feedback: input.feedback, updatedAt: new Date(Math.max(correctedAt.getTime(), result.updatedAt.getTime() + 1)) },
      });

      if (
        updated.publishedAt?.getTime() !== originalProvenance.publishedAt.getTime() ||
        updated.publishedById !== originalProvenance.publishedById ||
        updated.finalizedAt?.getTime() !== originalProvenance.finalizedAt.getTime() ||
        updated.finalizedById !== originalProvenance.finalizedById
      ) {
        throw new PortalConflictError("Result provenance changed unexpectedly; the correction was rolled back");
      }

      return {
        assessmentResultId: updated.id,
        correctionId: correction.id,
        score: updated.score,
        maxScore: updated.maxScore,
        feedback: updated.feedback,
        correctedAt: correction.createdAt.toISOString(),
        correctedById: correction.correctedById,
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  },
};