import { Prisma } from "@prisma/client";
import type {
  AddCurriculumCourseInput,
  ProgrammeCurriculumRead,
  ReorderCurriculumCoursesInput,
  UpdateCurriculumCourseInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { curriculumService } from "./curriculum-service.ts";

export class CurriculumDraftNotFoundError extends Error {}
export class CurriculumDraftConflictError extends Error {}
export class CurriculumDraftMutationError extends Error {}

async function getDraftVersion(versionId: string) {
  const version = await prisma.programmeCurriculumVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      curriculumId: true,
      status: true,
      curriculum: { select: { programmeId: true } },
    },
  });
  if (!version) throw new CurriculumDraftNotFoundError("Curriculum version not found");
  if (version.status !== "Draft") {
    throw new CurriculumDraftMutationError("Only Draft curriculum versions can be edited");
  }
  return version;
}

export const curriculumDraftService = {
  async getDraftContext(versionId: string) {
    return getDraftVersion(versionId);
  },

  async addCourse(
    versionId: string,
    actorId: string,
    input: AddCurriculumCourseInput,
  ): Promise<ProgrammeCurriculumRead> {
    const version = await getDraftVersion(versionId);
    const course = await prisma.course.findUnique({
      where: { id: input.courseId },
      select: {
        id: true,
        programmeId: true,
        code: true,
        title: true,
        credits: true,
        courseType: true,
      },
    });
    if (!course) throw new CurriculumDraftNotFoundError("Course not found");
    if (course.programmeId !== version.curriculum.programmeId) {
      throw new CurriculumDraftMutationError(
        "A course from another programme cannot be added to this curriculum",
      );
    }

    const creditsSnapshot = input.credits ?? course.credits;
    const courseTypeSnapshot = input.courseType ?? course.courseType;
    if (creditsSnapshot === null) {
      throw new CurriculumDraftMutationError(
        "Course credits must be set before the course can be added to a curriculum",
      );
    }
    if (courseTypeSnapshot === null) {
      throw new CurriculumDraftMutationError(
        "Course type must be set before the course can be added to a curriculum",
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const placement = await tx.programmeCurriculumCourse.create({
          data: {
            curriculumVersionId: version.id,
            courseId: course.id,
            yearLevel: input.yearLevel,
            semester: input.semester,
            creditsSnapshot,
            courseTypeSnapshot,
            sortOrder: input.sortOrder,
          },
          select: { id: true },
        });
        await tx.programmeCurriculumAuditAction.create({
          data: {
            curriculumVersionId: version.id,
            actorId,
            action: "CourseAdded",
            note: `Added ${course.code} to draft curriculum`,
            details: {
              placementId: placement.id,
              courseId: course.id,
              courseCode: course.code,
              yearLevel: input.yearLevel,
              semester: input.semester,
              credits: creditsSnapshot,
              courseType: courseTypeSnapshot,
              sortOrder: input.sortOrder,
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CurriculumDraftConflictError("This course is already in the selected curriculum version");
      }
      throw error;
    }

    return curriculumService.getById(version.curriculumId, version.id);
  },

  async updateCourse(
    placementId: string,
    actorId: string,
    input: UpdateCurriculumCourseInput,
  ): Promise<ProgrammeCurriculumRead> {
    const placement = await prisma.programmeCurriculumCourse.findUnique({
      where: { id: placementId },
      select: {
        id: true,
        courseId: true,
        yearLevel: true,
        semester: true,
        creditsSnapshot: true,
        courseTypeSnapshot: true,
        sortOrder: true,
        curriculumVersion: {
          select: {
            id: true,
            curriculumId: true,
            status: true,
          },
        },
      },
    });
    if (!placement) throw new CurriculumDraftNotFoundError("Curriculum course placement not found");
    if (placement.curriculumVersion.status !== "Draft") {
      throw new CurriculumDraftMutationError("Only Draft curriculum versions can be edited");
    }

    await prisma.$transaction(async (tx) => {
      await tx.programmeCurriculumCourse.update({
        where: { id: placement.id },
        data: {
          yearLevel: input.yearLevel,
          semester: input.semester,
          sortOrder: input.sortOrder,
          ...(input.credits === undefined ? {} : { creditsSnapshot: input.credits }),
          ...(input.courseType === undefined ? {} : { courseTypeSnapshot: input.courseType }),
        },
      });
      await tx.programmeCurriculumAuditAction.create({
        data: {
          curriculumVersionId: placement.curriculumVersion.id,
          actorId,
          action: "CourseUpdated",
          note: "Updated draft curriculum course placement",
          details: {
            placementId: placement.id,
            courseId: placement.courseId,
            before: {
              yearLevel: placement.yearLevel,
              semester: placement.semester,
              credits: placement.creditsSnapshot,
              courseType: placement.courseTypeSnapshot,
              sortOrder: placement.sortOrder,
            },
            after: {
              yearLevel: input.yearLevel,
              semester: input.semester,
              credits: input.credits ?? placement.creditsSnapshot,
              courseType: input.courseType ?? placement.courseTypeSnapshot,
              sortOrder: input.sortOrder,
            },
          },
        },
      });
    });

    return curriculumService.getById(
      placement.curriculumVersion.curriculumId,
      placement.curriculumVersion.id,
    );
  },

  async removeCourse(
    placementId: string,
    actorId: string,
    reason: string,
  ): Promise<ProgrammeCurriculumRead> {
    const placement = await prisma.programmeCurriculumCourse.findUnique({
      where: { id: placementId },
      select: {
        id: true,
        courseId: true,
        yearLevel: true,
        semester: true,
        creditsSnapshot: true,
        courseTypeSnapshot: true,
        sortOrder: true,
        course: { select: { code: true } },
        curriculumVersion: {
          select: { id: true, curriculumId: true, status: true },
        },
      },
    });
    if (!placement) throw new CurriculumDraftNotFoundError("Curriculum course placement not found");
    if (placement.curriculumVersion.status !== "Draft") {
      throw new CurriculumDraftMutationError("Only Draft curriculum versions can be edited");
    }

    await prisma.$transaction(async (tx) => {
      await tx.programmeCurriculumAuditAction.create({
        data: {
          curriculumVersionId: placement.curriculumVersion.id,
          actorId,
          action: "CourseRemoved",
          note: reason,
          details: {
            placementId: placement.id,
            courseId: placement.courseId,
            courseCode: placement.course.code,
            yearLevel: placement.yearLevel,
            semester: placement.semester,
            credits: placement.creditsSnapshot,
            courseType: placement.courseTypeSnapshot,
            sortOrder: placement.sortOrder,
          },
        },
      });
      await tx.programmeCurriculumCourse.delete({ where: { id: placement.id } });
    });

    return curriculumService.getById(
      placement.curriculumVersion.curriculumId,
      placement.curriculumVersion.id,
    );
  },

  async reorderCourses(
    versionId: string,
    actorId: string,
    input: ReorderCurriculumCoursesInput,
  ): Promise<ProgrammeCurriculumRead> {
    const version = await getDraftVersion(versionId);
    if (new Set(input.placementIds).size !== input.placementIds.length) {
      throw new CurriculumDraftMutationError("Placement ids in a reorder request must be unique");
    }

    const existing = await prisma.programmeCurriculumCourse.findMany({
      where: {
        curriculumVersionId: version.id,
        yearLevel: input.yearLevel,
        semester: input.semester,
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const existingIds = existing.map((item) => item.id).sort();
    const requestedIds = [...input.placementIds].sort();
    if (
      existingIds.length !== requestedIds.length ||
      existingIds.some((id, index) => id !== requestedIds[index])
    ) {
      throw new CurriculumDraftMutationError(
        "Reorder request must contain every placement in the selected year and semester exactly once",
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const [sortOrder, placementId] of input.placementIds.entries()) {
        await tx.programmeCurriculumCourse.update({
          where: { id: placementId },
          data: { sortOrder },
        });
      }
      await tx.programmeCurriculumAuditAction.create({
        data: {
          curriculumVersionId: version.id,
          actorId,
          action: "CourseUpdated",
          note: "Reordered draft curriculum courses",
          details: {
            yearLevel: input.yearLevel,
            semester: input.semester,
            placementIds: input.placementIds,
          },
        },
      });
    });

    return curriculumService.getById(version.curriculumId, version.id);
  },
};

export type CurriculumDraftService = typeof curriculumDraftService;
