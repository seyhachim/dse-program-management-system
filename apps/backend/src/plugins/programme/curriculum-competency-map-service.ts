import type {
  CurriculumCompetencyMap,
  CurriculumCourseCompetencyMapping,
  UpdateCurriculumCourseCompetencyMappingInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { formatProgrammeCurriculumVersion } from "./curriculum-domain.ts";
import { competencyFrameworkService } from "./competency-framework-service.ts";

export class CurriculumCompetencyMapNotFoundError extends Error {}
export class CurriculumCompetencyMapConflictError extends Error {}
export class InvalidCurriculumCompetencyMappingError extends Error {}

const courseSelect = {
  id: true,
  courseId: true,
  pathwayId: true,
  yearLevel: true,
  semester: true,
  creditsSnapshot: true,
  courseTypeSnapshot: true,
  sortOrder: true,
  course: {
    select: {
      code: true,
      title: true,
    },
  },
  competencyMappings: {
    select: {
      id: true,
      curriculumVersionId: true,
      curriculumCourseId: true,
      competencyId: true,
      teachLevel: true,
      useLevel: true,
      assessLevel: true,
      note: true,
      updatedById: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

function toMappingView(mapping: {
  id: string;
  curriculumVersionId: string;
  curriculumCourseId: string;
  competencyId: string;
  teachLevel: "Basic" | "Intermediate" | "Advanced" | null;
  useLevel: "Basic" | "Intermediate" | "Advanced" | null;
  assessLevel: "Basic" | "Intermediate" | "Advanced" | null;
  note: string;
  updatedById: string;
  createdAt: Date;
  updatedAt: Date;
}): CurriculumCourseCompetencyMapping {
  return {
    id: mapping.id,
    curriculumVersionId: mapping.curriculumVersionId,
    placementId: mapping.curriculumCourseId,
    competencyId: mapping.competencyId,
    teachLevel: mapping.teachLevel,
    useLevel: mapping.useLevel,
    assessLevel: mapping.assessLevel,
    note: mapping.note,
    updatedById: mapping.updatedById,
    createdAt: mapping.createdAt.toISOString(),
    updatedAt: mapping.updatedAt.toISOString(),
  };
}

function stateOf(input: {
  teachLevel: "Basic" | "Intermediate" | "Advanced" | null;
  useLevel: "Basic" | "Intermediate" | "Advanced" | null;
  assessLevel: "Basic" | "Intermediate" | "Advanced" | null;
  note: string;
}) {
  return {
    teachLevel: input.teachLevel,
    useLevel: input.useLevel,
    assessLevel: input.assessLevel,
    note: input.note,
  };
}

export const curriculumCompetencyMapService = {
  async getVersionContext(versionId: string) {
    const version = await prisma.programmeCurriculumVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        status: true,
        versionMajor: true,
        versionMinor: true,
        competencyFrameworkVersionId: true,
        curriculum: {
          select: {
            id: true,
            programmeId: true,
          },
        },
      },
    });
    if (!version) {
      throw new CurriculumCompetencyMapNotFoundError("Curriculum version not found");
    }
    return {
      id: version.id,
      curriculumId: version.curriculum.id,
      programmeId: version.curriculum.programmeId,
      status: version.status,
      version: formatProgrammeCurriculumVersion(
        version.versionMajor,
        version.versionMinor,
      ),
      competencyFrameworkVersionId: version.competencyFrameworkVersionId,
    };
  },

  async getMap(versionId: string): Promise<CurriculumCompetencyMap> {
    const context = await this.getVersionContext(versionId);
    const [framework, rows, pathways] = await Promise.all([
      competencyFrameworkService.getBindingForCurriculumVersion(versionId),
      prisma.programmeCurriculumCourse.findMany({
        where: { curriculumVersionId: versionId },
        orderBy: [
          { yearLevel: "asc" },
          { semester: "asc" },
          { sortOrder: "asc" },
          { courseId: "asc" },
        ],
        select: courseSelect,
      }),
      prisma.programmeCurriculumPathway.findMany({
        where: { curriculumVersionId: versionId },
        orderBy: [
          { yearLevel: "asc" },
          { semester: "asc" },
          { sortOrder: "asc" },
          { code: "asc" },
        ],
        select: {
          id: true,
          code: true,
          name: true,
          yearLevel: true,
          semester: true,
          isDefault: true,
        },
      }),
    ]);

    const competencyOrder = new Map(
      (framework?.competencies ?? []).map((competency, index) => [
        competency.id,
        index,
      ]),
    );

    const courses = rows.map((row) => ({
      placementId: row.id,
      courseId: row.courseId,
      code: row.course.code,
      title: row.course.title,
      yearLevel: row.yearLevel,
      semester: row.semester,
      credits: row.creditsSnapshot,
      courseType: row.courseTypeSnapshot,
      sortOrder: row.sortOrder,
      pathwayId: row.pathwayId,
      mappings: row.competencyMappings
        .map(toMappingView)
        .sort(
          (a, b) =>
            (competencyOrder.get(a.competencyId) ?? Number.MAX_SAFE_INTEGER) -
            (competencyOrder.get(b.competencyId) ?? Number.MAX_SAFE_INTEGER),
        ),
    }));

    const mappedCompetencyIds = new Set<string>();
    let mappedCourseCount = 0;
    for (const course of courses) {
      if (course.mappings.length > 0) mappedCourseCount += 1;
      for (const mapping of course.mappings) {
        mappedCompetencyIds.add(mapping.competencyId);
      }
    }

    const competencyCount = framework?.competencies.length ?? 0;

    return {
      curriculumVersion: {
        id: context.id,
        status: context.status,
        version: context.version,
      },
      framework,
      courses,
      pathways,
      summary: {
        courseCount: courses.length,
        competencyCount,
        mappedCourseCount,
        unmappedCourseCount: courses.length - mappedCourseCount,
        mappedCompetencyCount: mappedCompetencyIds.size,
        unmappedCompetencyCount: Math.max(
          0,
          competencyCount - mappedCompetencyIds.size,
        ),
      },
    };
  },

  async updateMapping(
    versionId: string,
    placementId: string,
    competencyId: string,
    actorId: string,
    input: UpdateCurriculumCourseCompetencyMappingInput,
  ): Promise<CurriculumCompetencyMap> {
    const context = await this.getVersionContext(versionId);
    if (context.status !== "Draft") {
      throw new CurriculumCompetencyMapConflictError(
        "Course competency mappings can only change on Draft curriculum versions",
      );
    }
    if (!context.competencyFrameworkVersionId) {
      throw new CurriculumCompetencyMapConflictError(
        "Assign a competency framework to the Draft curriculum before mapping courses",
      );
    }

    const [placement, competency] = await Promise.all([
      prisma.programmeCurriculumCourse.findFirst({
        where: {
          id: placementId,
          curriculumVersionId: versionId,
        },
        select: {
          id: true,
          courseId: true,
          course: { select: { code: true } },
        },
      }),
      prisma.programmeCompetencyFrameworkCompetency.findFirst({
        where: {
          id: competencyId,
          frameworkVersionId: context.competencyFrameworkVersionId,
        },
        select: {
          id: true,
          code: true,
        },
      }),
    ]);

    if (!placement) {
      throw new CurriculumCompetencyMapNotFoundError(
        "Course placement is not part of this curriculum version",
      );
    }
    if (!competency) {
      throw new CurriculumCompetencyMapNotFoundError(
        "Competency is not part of the curriculum-bound framework version",
      );
    }

    const current =
      await prisma.programmeCurriculumCourseCompetencyMapping.findUnique({
        where: {
          curriculumVersionId_curriculumCourseId_competencyId: {
            curriculumVersionId: versionId,
            curriculumCourseId: placementId,
            competencyId,
          },
        },
      });

    const clear =
      input.teachLevel === null &&
      input.useLevel === null &&
      input.assessLevel === null;

    if (clear && !current) {
      return this.getMap(versionId);
    }

    await prisma.$transaction(async (tx) => {
      if (clear) {
        await tx.programmeCurriculumCourseCompetencyMapping.delete({
          where: { id: current!.id },
        });
        await tx.programmeCurriculumAuditAction.create({
          data: {
            curriculumVersionId: versionId,
            actorId,
            action: "CompetencyMappingCleared",
            note: "Course competency mapping cleared",
            details: {
              placementId,
              courseId: placement.courseId,
              courseCode: placement.course.code,
              competencyId,
              competencyCode: competency.code,
              before: stateOf(current!),
              after: null,
            },
          },
        });
        return;
      }

      const after = {
        teachLevel: input.teachLevel,
        useLevel: input.useLevel,
        assessLevel: input.assessLevel,
        note: input.note,
      };

      await tx.programmeCurriculumCourseCompetencyMapping.upsert({
        where: {
          curriculumVersionId_curriculumCourseId_competencyId: {
            curriculumVersionId: versionId,
            curriculumCourseId: placementId,
            competencyId,
          },
        },
        create: {
          curriculumVersionId: versionId,
          curriculumCourseId: placementId,
          competencyId,
          ...after,
          updatedById: actorId,
        },
        update: {
          ...after,
          updatedById: actorId,
        },
      });

      await tx.programmeCurriculumAuditAction.create({
        data: {
          curriculumVersionId: versionId,
          actorId,
          action: "CompetencyMappingUpdated",
          note: current
            ? "Course competency mapping updated"
            : "Course competency mapping created",
          details: {
            placementId,
            courseId: placement.courseId,
            courseCode: placement.course.code,
            competencyId,
            competencyCode: competency.code,
            before: current ? stateOf(current) : null,
            after,
          },
        },
      });
    });

    return this.getMap(versionId);
  },
};

export type CurriculumCompetencyMapService =
  typeof curriculumCompetencyMapService;
