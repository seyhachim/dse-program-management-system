import { Prisma } from "@prisma/client";
import type {
  AddCurriculumCourseInput,
  ProgrammeCurriculumRead,
  ReorderCurriculumCoursesInput,
  UpdateCurriculumCourseInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { curriculumService } from "./curriculum-service.ts";
import { getCurriculumWorkflowState } from "./curriculum-workflow-service.ts";

export class CurriculumDraftNotFoundError extends Error {}
export class CurriculumDraftConflictError extends Error {}
export class CurriculumDraftMutationError extends Error {}

async function assertEditableWorkflow(versionId: string) {
  const workflow = await getCurriculumWorkflowState(versionId);
  if (workflow.status !== "Draft") {
    throw new CurriculumDraftMutationError("Only Draft curriculum versions can be edited");
  }
}

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
  await assertEditableWorkflow(versionId);
  return version;
}

// Serialize draft placement edits against the version and check the actual review marker.
async function lockEditableDraft(tx: Prisma.TransactionClient, versionId: string) {
  const rows = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT "status"::text AS status FROM public."ProgrammeCurriculumVersion"
    WHERE "id" = ${versionId} FOR UPDATE
  `;
  if (rows[0]?.status !== "Draft") {
    throw new CurriculumDraftMutationError("Only Draft curriculum versions can be edited");
  }
  const review = await tx.$queryRaw<Array<{ marker: string }>>`
    SELECT "details"->>'workflowAction' AS marker
    FROM public."ProgrammeCurriculumAuditAction"
    WHERE "curriculumVersionId" = ${versionId}
      AND "action" = 'MetadataUpdated'
      AND "details"->>'workflowAction' IN ('SubmittedForReview', 'ChangesRequested')
    ORDER BY "createdAt" DESC, "id" DESC LIMIT 1
  `;
  if (review[0]?.marker === "SubmittedForReview") {
    throw new CurriculumDraftMutationError("Only Draft curriculum versions can be edited");
  }
}

async function readOfficialCode(tx: Prisma.TransactionClient, versionId: string, placementId: string, courseId: string) {
  const rows = await tx.$queryRaw<Array<{ code: string }>>`
    SELECT "courseCodeSnapshot" AS code FROM curriculum_artifact."CourseSnapshot"
    WHERE "curriculumVersionId" = ${versionId} AND "placementId" = ${placementId} AND "courseId" = ${courseId}
    FOR UPDATE
  `;
  if (!rows[0]) throw new CurriculumDraftConflictError("Official course snapshot is missing; review curriculum integrity");
  return rows[0].code;
}

async function writeOfficialCode(tx: Prisma.TransactionClient, versionId: string, placementId: string, courseId: string, code: string) {
  if (!code.trim() || code !== code.trim() || code.length > 40) {
    throw new CurriculumDraftMutationError("Official course code must contain 1–40 characters");
  }
  const duplicate = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM curriculum_artifact."CourseSnapshot"
    WHERE "curriculumVersionId" = ${versionId}
      AND "courseCodeSnapshot" = ${code}
      AND "placementId" IS DISTINCT FROM ${placementId}
    LIMIT 1
  `;
  if (duplicate.length) throw new CurriculumDraftConflictError("This official course code is already used in the selected curriculum version");
  const updated = await tx.$executeRaw`
    UPDATE curriculum_artifact."CourseSnapshot"
    SET "courseCodeSnapshot" = ${code}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "curriculumVersionId" = ${versionId} AND "placementId" = ${placementId} AND "courseId" = ${courseId}
  `;
  if (updated !== 1) throw new CurriculumDraftConflictError("Official course snapshot is missing; review curriculum integrity");
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
        await lockEditableDraft(tx, version.id);
        // The INSERT trigger may inherit a predecessor code before the requested code is written.
        await tx.$executeRaw`SET CONSTRAINTS curriculum_artifact."CourseSnapshot_version_official_code_key" DEFERRED`;
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
        const inheritedCode = await readOfficialCode(tx, version.id, placement.id, course.id);
        const officialCode = input.officialCode ?? inheritedCode;
        await writeOfficialCode(tx, version.id, placement.id, course.id, officialCode);
        await tx.programmeCurriculumAuditAction.create({
          data: {
            curriculumVersionId: version.id,
            actorId,
            action: "CourseAdded",
            note: `Added ${officialCode} to draft curriculum`,
            details: {
              placementId: placement.id,
              courseId: course.id,
              courseCode: officialCode,
              catalogueCode: course.code,
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
    await assertEditableWorkflow(placement.curriculumVersion.id);

    await prisma.$transaction(async (tx) => {
      await lockEditableDraft(tx, placement.curriculumVersion.id);
      const beforeCode = await readOfficialCode(tx, placement.curriculumVersion.id, placement.id, placement.courseId);
      const afterCode = input.officialCode ?? beforeCode;
      if (afterCode !== beforeCode) {
        if (!input.officialCodeReason?.trim()) {
          throw new CurriculumDraftMutationError("A reason is required to change the official course code");
        }
        await writeOfficialCode(tx, placement.curriculumVersion.id, placement.id, placement.courseId, afterCode);
      }
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
            officialCodeReason: afterCode !== beforeCode ? input.officialCodeReason!.trim() : null,
            before: {
              code: beforeCode,
              yearLevel: placement.yearLevel,
              semester: placement.semester,
              credits: placement.creditsSnapshot,
              courseType: placement.courseTypeSnapshot,
              sortOrder: placement.sortOrder,
            },
            after: {
              code: afterCode,
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
    await assertEditableWorkflow(placement.curriculumVersion.id);

    await prisma.$transaction(async (tx) => {
      await lockEditableDraft(tx, placement.curriculumVersion.id);
      const officialCode = await readOfficialCode(tx, placement.curriculumVersion.id, placement.id, placement.courseId);
      await tx.programmeCurriculumAuditAction.create({
        data: {
          curriculumVersionId: placement.curriculumVersion.id,
          actorId,
          action: "CourseRemoved",
          note: reason,
          details: {
            placementId: placement.id,
            courseId: placement.courseId,
            courseCode: officialCode,
            catalogueCode: placement.course.code,
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

    // The curriculum read model intentionally exposes common placements plus the
    // selected/default route only. Reorder validation must use that exact same
    // visibility predicate so hidden alternative-pathway rows never make a valid
    // editor request impossible to satisfy.
    const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT pc."id"
      FROM public."ProgrammeCurriculumCourse" pc
      LEFT JOIN public."ProgrammeCurriculumPathway" p ON p."id" = pc."pathwayId"
      WHERE pc."curriculumVersionId" = ${version.id}
        AND pc."yearLevel" = ${input.yearLevel}
        AND pc."semester" = ${input.semester}::"Semester"
        AND (pc."pathwayId" IS NULL OR p."isDefault" = TRUE)
      ORDER BY pc."sortOrder", pc."id"
    `);
    const existingIds = existing.map((item) => item.id).sort();
    const requestedIds = [...input.placementIds].sort();
    if (
      existingIds.length !== requestedIds.length ||
      existingIds.some((id, index) => id !== requestedIds[index])
    ) {
      throw new CurriculumDraftMutationError(
        "Reorder request must contain every visible placement in the selected default route exactly once",
      );
    }

    await prisma.$transaction(async (tx) => {
      await lockEditableDraft(tx, version.id);
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
