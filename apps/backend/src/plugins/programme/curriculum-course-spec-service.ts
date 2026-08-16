import { Prisma } from "@prisma/client";
import type {
  BindCurriculumCourseSpecInput,
  CurriculumCourseSpecBindings,
  CurriculumCourseSpecVersion,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { findInvalidCurriculumCourseSpecBindings } from "./curriculum-course-spec-integrity.ts";
import { getCurriculumWorkflowState } from "./curriculum-workflow-service.ts";

export class CurriculumCourseSpecNotFoundError extends Error {}
export class CurriculumCourseSpecValidationError extends Error {}
export class CurriculumCourseSpecConflictError extends Error {}

interface PlacementRow {
  placementId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  courseSpecVersionId: string | null;
}

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toVersion(spec: {
  id: string;
  courseId: string;
  versionMajor: number;
  versionMinor: number;
  approvedAt: Date | null;
  effectiveFrom: Date | null;
}): CurriculumCourseSpecVersion {
  return {
    id: spec.id,
    courseId: spec.courseId,
    versionMajor: spec.versionMajor,
    versionMinor: spec.versionMinor,
    version: `${spec.versionMajor}.${spec.versionMinor}`,
    approvedAt: spec.approvedAt?.toISOString() ?? null,
    effectiveFrom: toIsoDate(spec.effectiveFrom),
  };
}

async function loadVersion(versionId: string) {
  const version = await prisma.programmeCurriculumVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      curriculumId: true,
      status: true,
      curriculum: { select: { programmeId: true } },
    },
  });
  if (!version) throw new CurriculumCourseSpecNotFoundError("Curriculum version not found");
  return version;
}

async function loadPlacements(versionId: string): Promise<PlacementRow[]> {
  return prisma.$queryRaw<PlacementRow[]>(Prisma.sql`
    SELECT
      placement."id" AS "placementId",
      placement."courseId" AS "courseId",
      course."code" AS "courseCode",
      course."title" AS "courseTitle",
      placement."courseSpecVersionId" AS "courseSpecVersionId"
    FROM "ProgrammeCurriculumCourse" placement
    INNER JOIN "Course" course ON course."id" = placement."courseId"
    WHERE placement."curriculumVersionId" = ${versionId}
    ORDER BY placement."yearLevel", placement."semester", placement."sortOrder", placement."courseId"
  `);
}

export const curriculumCourseSpecService = {
  async programmeId(versionId: string) {
    return (await loadVersion(versionId)).curriculum.programmeId;
  },

  async list(versionId: string): Promise<CurriculumCourseSpecBindings> {
    const version = await loadVersion(versionId);
    const placements = await loadPlacements(versionId);
    const courseIds = [...new Set(placements.map((placement) => placement.courseId))];
    const linkedIds = placements
      .map((placement) => placement.courseSpecVersionId)
      .filter((value): value is string => Boolean(value));

    const specs = courseIds.length === 0
      ? []
      : await prisma.courseSpec.findMany({
          where: {
            OR: [
              { courseId: { in: courseIds }, reviewStatus: "Approved" },
              ...(linkedIds.length > 0 ? [{ id: { in: linkedIds } }] : []),
            ],
          },
          orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
          select: {
            id: true,
            courseId: true,
            versionMajor: true,
            versionMinor: true,
            reviewStatus: true,
            approvedAt: true,
            effectiveFrom: true,
          },
        });

    const versionById = new Map(specs.map((spec) => [spec.id, spec]));
    const approvedByCourse = new Map<string, typeof specs>();
    for (const spec of specs) {
      if (spec.reviewStatus !== "Approved") continue;
      const bucket = approvedByCourse.get(spec.courseId) ?? [];
      bucket.push(spec);
      approvedByCourse.set(spec.courseId, bucket);
    }

    const bindings = placements.map((placement) => {
      const linked = placement.courseSpecVersionId
        ? versionById.get(placement.courseSpecVersionId) ?? null
        : null;
      return {
        placementId: placement.placementId,
        courseId: placement.courseId,
        courseCode: placement.courseCode,
        courseTitle: placement.courseTitle,
        linkedVersion: linked ? toVersion(linked) : null,
        eligibleVersions: (approvedByCourse.get(placement.courseId) ?? []).map(toVersion),
      };
    });

    const invalidCourseCodes = await findInvalidCurriculumCourseSpecBindings(versionId);

    return {
      curriculumId: version.curriculumId,
      versionId: version.id,
      versionStatus: version.status,
      activationReady: placements.length > 0 && invalidCourseCodes.length === 0,
      missingBindingCount: invalidCourseCodes.length,
      bindings,
    };
  },

  async bind(
    versionId: string,
    placementId: string,
    actorId: string,
    input: BindCurriculumCourseSpecInput,
  ): Promise<CurriculumCourseSpecBindings> {
    const version = await loadVersion(versionId);
    const workflow = await getCurriculumWorkflowState(versionId);
    if (version.status !== "Draft" || workflow.status !== "Draft") {
      throw new CurriculumCourseSpecConflictError(
        "CourseSpec bindings can only be changed on an editable Draft curriculum",
      );
    }

    const placement = await prisma.programmeCurriculumCourse.findUnique({
      where: { id: placementId },
      select: { id: true, courseId: true, curriculumVersionId: true },
    });
    if (!placement) throw new CurriculumCourseSpecNotFoundError("Curriculum placement not found");
    if (placement.curriculumVersionId !== versionId) {
      throw new CurriculumCourseSpecConflictError(
        "Placement does not belong to the selected curriculum version",
      );
    }

    if (input.courseSpecVersionId) {
      const spec = await prisma.courseSpec.findUnique({
        where: { id: input.courseSpecVersionId },
        select: { id: true, courseId: true, reviewStatus: true },
      });
      if (!spec) throw new CurriculumCourseSpecNotFoundError("CourseSpec version not found");
      if (spec.courseId !== placement.courseId) {
        throw new CurriculumCourseSpecValidationError(
          "CourseSpec version belongs to another course",
        );
      }
      if (spec.reviewStatus !== "Approved") {
        throw new CurriculumCourseSpecValidationError(
          "Only an Approved CourseSpec version can be bound to a curriculum placement",
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      const previous = await tx.$queryRaw<Array<{ courseSpecVersionId: string | null }>>(Prisma.sql`
        SELECT "courseSpecVersionId" AS "courseSpecVersionId"
        FROM "ProgrammeCurriculumCourse"
        WHERE "id" = ${placementId}
        FOR UPDATE
      `);
      if (previous.length === 0) {
        throw new CurriculumCourseSpecNotFoundError("Curriculum placement not found");
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE "ProgrammeCurriculumCourse"
        SET "courseSpecVersionId" = ${input.courseSpecVersionId}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${placementId}
      `);
      await tx.programmeCurriculumAuditAction.create({
        data: {
          curriculumVersionId: versionId,
          actorId,
          action: "CourseUpdated",
          note: input.courseSpecVersionId
            ? "Bound approved CourseSpec version to curriculum placement"
            : "Cleared CourseSpec version binding from curriculum placement",
          details: {
            placementId,
            courseId: placement.courseId,
            beforeCourseSpecVersionId: previous[0]!.courseSpecVersionId,
            afterCourseSpecVersionId: input.courseSpecVersionId,
          },
        },
      });
    });

    return this.list(versionId);
  },
};

export type CurriculumCourseSpecService = typeof curriculumCourseSpecService;
