import { Prisma } from "@prisma/client";
import type {
  ProgrammeCurriculumRead,
  SaveCurriculumDraftInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import {
  CurriculumConflictError,
  CurriculumNotFoundError,
  InvalidCurriculumRevisionError,
  curriculumService,
} from "./curriculum-service.ts";

function placementKey(placement: {
  courseId: string;
  yearLevel: number;
  semester: string;
  creditsSnapshot: number;
  courseTypeSnapshot: string;
  sortOrder: number;
}) {
  return [
    placement.courseId,
    placement.yearLevel,
    placement.semester,
    placement.creditsSnapshot,
    placement.courseTypeSnapshot,
    placement.sortOrder,
  ].join(":");
}

function parseEffectiveFrom(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

/**
 * Draft-only mutation service for issue #317.
 *
 * The whole draft snapshot is saved atomically instead of mutating placements
 * one request at a time. `expectedUpdatedAt` is an optimistic concurrency token;
 * a stale editor gets a 409 and must reload before overwriting newer work.
 * Approved/Active/Superseded versions are never mutated here.
 */
export const curriculumDraftService = {
  async save(
    curriculumId: string,
    versionId: string,
    actorId: string,
    input: SaveCurriculumDraftInput,
  ): Promise<ProgrammeCurriculumRead> {
    await prisma.$transaction(
      async (tx) => {
        const version = await tx.programmeCurriculumVersion.findUnique({
          where: { id: versionId },
          select: {
            id: true,
            curriculumId: true,
            status: true,
            updatedAt: true,
            cohortLabel: true,
            intakeYear: true,
            academicYear: true,
            effectiveFrom: true,
            curriculum: { select: { programmeId: true } },
            courses: {
              select: {
                courseId: true,
                yearLevel: true,
                semester: true,
                creditsSnapshot: true,
                courseTypeSnapshot: true,
                sortOrder: true,
              },
            },
          },
        });

        if (!version || version.curriculumId !== curriculumId) {
          throw new CurriculumNotFoundError("Curriculum draft version not found");
        }
        if (version.status !== "Draft") {
          throw new InvalidCurriculumRevisionError(
            "Only Draft curriculum versions can be edited",
          );
        }
        if (version.updatedAt.toISOString() !== input.expectedUpdatedAt) {
          throw new CurriculumConflictError(
            "This curriculum draft changed after you opened it. Reload before saving.",
          );
        }

        const requestedCourseIds = input.placements.map((placement) => placement.courseId);
        const courses = requestedCourseIds.length
          ? await tx.course.findMany({
              where: { id: { in: requestedCourseIds } },
              select: { id: true, programmeId: true },
            })
          : [];
        const validCourseIds = new Set(
          courses
            .filter((course) => course.programmeId === version.curriculum.programmeId)
            .map((course) => course.id),
        );
        if (validCourseIds.size !== requestedCourseIds.length) {
          throw new InvalidCurriculumRevisionError(
            "Every curriculum placement must reference a course in the same programme",
          );
        }

        const previousByCourse = new Map(
          version.courses.map((placement) => [placement.courseId, placement]),
        );
        const nextByCourse = new Map(
          input.placements.map((placement) => [placement.courseId, placement]),
        );
        const added = input.placements
          .filter((placement) => !previousByCourse.has(placement.courseId))
          .map((placement) => placement.courseId);
        const removed = version.courses
          .filter((placement) => !nextByCourse.has(placement.courseId))
          .map((placement) => placement.courseId);
        const updated = input.placements
          .filter((placement) => {
            const previous = previousByCourse.get(placement.courseId);
            if (!previous) return false;
            return placementKey(previous) !== placementKey({
              courseId: placement.courseId,
              yearLevel: placement.yearLevel,
              semester: placement.semester,
              creditsSnapshot: placement.credits,
              courseTypeSnapshot: placement.courseType,
              sortOrder: placement.sortOrder,
            });
          })
          .map((placement) => placement.courseId);

        const metadataChanged =
          version.cohortLabel !== input.cohortLabel ||
          version.intakeYear !== input.intakeYear ||
          version.academicYear !== input.academicYear ||
          (version.effectiveFrom?.toISOString().slice(0, 10) ?? null) !== input.effectiveFrom;

        await tx.programmeCurriculumCourse.deleteMany({
          where: { curriculumVersionId: versionId },
        });
        if (input.placements.length > 0) {
          await tx.programmeCurriculumCourse.createMany({
            data: input.placements.map((placement) => ({
              curriculumVersionId: versionId,
              courseId: placement.courseId,
              yearLevel: placement.yearLevel,
              semester: placement.semester,
              creditsSnapshot: placement.credits,
              courseTypeSnapshot: placement.courseType,
              sortOrder: placement.sortOrder,
            })),
          });
        }

        await tx.programmeCurriculumVersion.update({
          where: { id: versionId },
          data: {
            cohortLabel: input.cohortLabel,
            intakeYear: input.intakeYear,
            academicYear: input.academicYear,
            effectiveFrom: parseEffectiveFrom(input.effectiveFrom),
            updatedAt: new Date(),
          },
        });

        if (metadataChanged) {
          await tx.programmeCurriculumAuditAction.create({
            data: {
              curriculumVersionId: versionId,
              actorId,
              action: "MetadataUpdated",
              note: "Draft curriculum metadata updated",
              details: {
                cohortLabel: input.cohortLabel,
                intakeYear: input.intakeYear,
                academicYear: input.academicYear,
                effectiveFrom: input.effectiveFrom,
              },
            },
          });
        }
        for (const [action, courseIds] of [
          ["CourseAdded", added],
          ["CourseUpdated", updated],
          ["CourseRemoved", removed],
        ] as const) {
          if (courseIds.length === 0) continue;
          await tx.programmeCurriculumAuditAction.create({
            data: {
              curriculumVersionId: versionId,
              actorId,
              action,
              note: `Draft curriculum ${action.replace("Course", "course ").toLowerCase()}`,
              details: { courseIds },
            },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return curriculumService.getById(curriculumId, versionId);
  },
};
