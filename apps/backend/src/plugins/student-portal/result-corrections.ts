import type {
  FinalizedResultCorrectionHistory,
  FinalizedResultCorrectionWorkspace,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { canManageOfferingResults } from "./results-lifecycle.ts";
import {
  PortalAccessError,
  PortalConflictError,
  PortalNotFoundError,
} from "./service.ts";

function assertResultManager(input: {
  authorId: string;
  programmeWide: boolean;
  lecturerId: string | null;
  coLecturerIds: string[];
}) {
  if (!canManageOfferingResults(
    input.authorId,
    input.programmeWide,
    input.lecturerId,
    input.coLecturerIds,
  )) {
    throw new PortalAccessError("You are not assigned to this offering");
  }
}

export const resultCorrectionsService = {
  async workspace(
    authorId: string,
    programmeWide: boolean,
    offeringId: string,
  ): Promise<FinalizedResultCorrectionWorkspace> {
    const offering = await prisma.offering.findUnique({
      where: { id: offeringId },
      include: {
        coLecturers: true,
        course: { select: { code: true, title: true } },
        courseSpec: {
          select: {
            id: true,
            assessmentItems: { select: { id: true, name: true } },
          },
        },
        enrollments: {
          orderBy: { student: { name: "asc" } },
          include: {
            student: { select: { id: true, studentId: true, name: true } },
            results: {
              where: { finalizedAt: { not: null } },
              include: {
                publishedBy: { select: { name: true } },
                finalizedBy: { select: { name: true } },
                corrections: {
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  take: 1,
                  include: { correctedBy: { select: { name: true } } },
                },
                _count: { select: { corrections: true } },
              },
            },
          },
        },
      },
    });
    if (!offering) throw new PortalNotFoundError("Offering not found");

    assertResultManager({
      authorId,
      programmeWide,
      lecturerId: offering.lecturerId,
      coLecturerIds: offering.coLecturers.map((item) => item.lecturerId),
    });

    const spec = offering.courseSpec ?? null;
    if (!spec) {
      throw new PortalConflictError("Offering is not bound to an Approved CourseSpec version");
    }
    const assessmentById = new Map(spec.assessmentItems.map((item) => [item.id, item]));

    const results = offering.enrollments.flatMap((enrollment) =>
      enrollment.results
        .filter((result) => result.courseSpecId === spec.id)
        .map((result) => {
          if (!result.publishedAt || !result.finalizedAt) {
            throw new PortalConflictError(
              "Finalized result provenance is incomplete. Reload after the academic record is repaired.",
            );
          }
          const assessment = assessmentById.get(result.assessmentItemId);
          if (!assessment) {
            throw new PortalConflictError(
              "Finalized result does not match the Offering's bound CourseSpec assessment.",
            );
          }
          const latest = result.corrections[0] ?? null;
          return {
            assessmentResultId: result.id,
            assessmentItemId: result.assessmentItemId,
            assessmentName: assessment.name,
            enrollmentId: enrollment.id,
            studentId: enrollment.student.id,
            studentCode: enrollment.student.studentId,
            studentName: enrollment.student.name,
            score: result.score,
            maxScore: result.maxScore,
            feedback: result.feedback,
            updatedAt: result.updatedAt.toISOString(),
            publishedAt: result.publishedAt.toISOString(),
            publishedByName: result.publishedBy?.name ?? null,
            finalizedAt: result.finalizedAt.toISOString(),
            finalizedByName: result.finalizedBy?.name ?? null,
            correctionSummary: {
              count: result._count.corrections,
              lastCorrectedAt: latest?.createdAt.toISOString() ?? null,
              lastCorrectedByName: latest?.correctedBy.name ?? null,
            },
          };
        }),
    );

    results.sort((a, b) =>
      a.assessmentName.localeCompare(b.assessmentName)
      || a.studentName.localeCompare(b.studentName)
      || a.assessmentResultId.localeCompare(b.assessmentResultId),
    );

    return {
      offeringId: offering.id,
      courseCode: offering.course.code,
      courseTitle: offering.course.title,
      sectionCode: offering.sectionCode,
      term: offering.term,
      results,
    };
  },

  async history(
    authorId: string,
    programmeWide: boolean,
    assessmentResultId: string,
  ): Promise<FinalizedResultCorrectionHistory> {
    const result = await prisma.assessmentResult.findUnique({
      where: { id: assessmentResultId },
      include: {
        publishedBy: { select: { name: true } },
        finalizedBy: { select: { name: true } },
        corrections: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: {
            correctedBy: { select: { name: true } },
          },
        },
        enrollment: {
          include: {
            student: { select: { id: true, studentId: true, name: true } },
            offering: {
              include: {
                coLecturers: true,
                course: { select: { code: true, title: true } },
                courseSpec: {
                  select: {
                    id: true,
                    assessmentItems: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!result) throw new PortalNotFoundError("Assessment result not found");

    const offering = result.enrollment.offering;
    assertResultManager({
      authorId,
      programmeWide,
      lecturerId: offering.lecturerId,
      coLecturerIds: offering.coLecturers.map((item) => item.lecturerId),
    });

    if (!result.publishedAt || !result.finalizedAt) {
      throw new PortalConflictError("Correction history is available only for finalized results");
    }
    const spec = offering.courseSpec ?? null;
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

    return {
      assessmentResultId: result.id,
      offeringId: offering.id,
      courseCode: offering.course.code,
      courseTitle: offering.course.title,
      sectionCode: offering.sectionCode,
      assessmentItemId: result.assessmentItemId,
      assessmentName: assessment.name,
      enrollmentId: result.enrollment.id,
      studentId: result.enrollment.student.id,
      studentCode: result.enrollment.student.studentId,
      studentName: result.enrollment.student.name,
      score: result.score,
      maxScore: result.maxScore,
      feedback: result.feedback,
      updatedAt: result.updatedAt.toISOString(),
      publishedAt: result.publishedAt.toISOString(),
      publishedByName: result.publishedBy?.name ?? null,
      finalizedAt: result.finalizedAt.toISOString(),
      finalizedByName: result.finalizedBy?.name ?? null,
      corrections: result.corrections.map((correction) => ({
        correctionId: correction.id,
        beforeScore: correction.beforeScore,
        beforeMaxScore: correction.beforeMaxScore,
        beforeFeedback: correction.beforeFeedback,
        afterScore: correction.afterScore,
        afterMaxScore: correction.afterMaxScore,
        afterFeedback: correction.afterFeedback,
        reason: correction.reason,
        correctedAt: correction.createdAt.toISOString(),
        correctedById: correction.correctedById,
        correctedByName: correction.correctedBy.name,
      })),
    };
  },
};
