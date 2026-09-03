import { Prisma } from "@prisma/client";
import type {
  CreateProgrammeCompetencyFrameworkVersionInput,
  ProgrammeCompetencyFrameworkVersion,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

const frameworkVersionInclude = {
  framework: { select: { id: true, programmeId: true, code: true } },
  competencies: { orderBy: [{ order: "asc" }, { code: "asc" }] },
} satisfies Prisma.ProgrammeCompetencyFrameworkVersionInclude;

function toFrameworkVersionView(version: {
  id: string;
  version: number;
  name: string;
  changeNote: string;
  createdById: string;
  createdAt: Date;
  framework: { id: string; programmeId: string; code: string };
  competencies: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    order: number;
    sourceActive: boolean;
    ploCodes: string[];
  }>;
}): ProgrammeCompetencyFrameworkVersion {
  return {
    frameworkId: version.framework.id,
    programmeId: version.framework.programmeId,
    frameworkCode: version.framework.code,
    frameworkVersionId: version.id,
    version: version.version,
    name: version.name,
    changeNote: version.changeNote,
    createdById: version.createdById,
    createdAt: version.createdAt.toISOString(),
    competencies: version.competencies.map((competency) => ({
      id: competency.id,
      code: competency.code,
      name: competency.name,
      description: competency.description,
      order: competency.order,
      sourceActive: competency.sourceActive,
      ploCodes: [...competency.ploCodes].sort(),
    })),
  };
}

export class CompetencyFrameworkNotFoundError extends Error {}
export class CompetencyFrameworkConflictError extends Error {}
export class InvalidCompetencyFrameworkAssignmentError extends Error {}

export const competencyFrameworkService = {
  async listForProgramme(programmeId: string): Promise<ProgrammeCompetencyFrameworkVersion[]> {
    const versions = await prisma.programmeCompetencyFrameworkVersion.findMany({
      where: { framework: { programmeId } },
      orderBy: [{ framework: { code: "asc" } }, { version: "desc" }],
      include: frameworkVersionInclude,
    });
    return versions.map(toFrameworkVersionView);
  },

  async getById(frameworkVersionId: string): Promise<ProgrammeCompetencyFrameworkVersion> {
    const version = await prisma.programmeCompetencyFrameworkVersion.findUnique({
      where: { id: frameworkVersionId },
      include: frameworkVersionInclude,
    });
    if (!version) throw new CompetencyFrameworkNotFoundError("Competency framework version not found");
    return toFrameworkVersionView(version);
  },

  async createSnapshot(
    programmeId: string,
    actorId: string,
    input: CreateProgrammeCompetencyFrameworkVersionInput,
  ): Promise<ProgrammeCompetencyFrameworkVersion> {
    let createdId: string;
    try {
      createdId = await prisma.$transaction(
        async (tx) => {
          const programme = await tx.programme.findUnique({
            where: { id: programmeId },
            select: { id: true },
          });
          if (!programme) throw new CompetencyFrameworkNotFoundError("Programme not found");

          const sourceCompetencies = await tx.programCompetency.findMany({
            orderBy: [{ order: "asc" }, { code: "asc" }],
            include: {
              ploLinks: { include: { plo: { select: { code: true } } } },
            },
          });
          if (sourceCompetencies.length === 0) {
            throw new InvalidCompetencyFrameworkAssignmentError(
              "The current programme competency catalogue has no competencies to snapshot",
            );
          }

          const existingFramework = await tx.programmeCompetencyFramework.findUnique({
            where: { programmeId_code: { programmeId, code: input.code } },
            select: { id: true },
          });
          const framework =
            existingFramework ??
            (await tx.programmeCompetencyFramework.create({
              data: { programmeId, code: input.code },
              select: { id: true },
            }));
          const latest = await tx.programmeCompetencyFrameworkVersion.aggregate({
            where: { frameworkId: framework.id },
            _max: { version: true },
          });
          const nextVersion = (latest._max.version ?? 0) + 1;
          const created = await tx.programmeCompetencyFrameworkVersion.create({
            data: {
              frameworkId: framework.id,
              version: nextVersion,
              name: input.name,
              changeNote: input.changeNote,
              createdById: actorId,
              competencies: {
                create: sourceCompetencies.map((competency) => ({
                  code: competency.code,
                  name: competency.name,
                  description: competency.description,
                  order: competency.order,
                  sourceActive: competency.active,
                  ploCodes: competency.ploLinks.map((link) => link.plo.code).sort(),
                })),
              },
            },
            select: { id: true },
          });
          return created.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CompetencyFrameworkConflictError(
          "Competency framework version changed concurrently; retry the snapshot",
        );
      }
      throw error;
    }
    return this.getById(createdId);
  },

  async getCurriculumVersionContext(versionId: string) {
    const version = await prisma.programmeCurriculumVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        status: true,
        curriculumId: true,
        curriculum: { select: { programmeId: true } },
      },
    });
    if (!version) throw new CompetencyFrameworkNotFoundError("Curriculum version not found");
    return {
      id: version.id,
      status: version.status,
      curriculumId: version.curriculumId,
      programmeId: version.curriculum.programmeId,
    };
  },

  async bindToCurriculumVersion(versionId: string, frameworkVersionId: string, actorId: string) {
    const [context, framework] = await Promise.all([
      this.getCurriculumVersionContext(versionId),
      prisma.programmeCompetencyFrameworkVersion.findUnique({
        where: { id: frameworkVersionId },
        select: {
          id: true,
          version: true,
          framework: { select: { programmeId: true, code: true } },
        },
      }),
    ]);
    if (!framework) throw new CompetencyFrameworkNotFoundError("Competency framework version not found");
    if (context.status !== "Draft") {
      throw new InvalidCompetencyFrameworkAssignmentError(
        "Competency framework assignments can only change on Draft curriculum versions",
      );
    }
    if (framework.framework.programmeId !== context.programmeId) {
      throw new InvalidCompetencyFrameworkAssignmentError(
        "Competency framework and curriculum version must belong to the same programme",
      );
    }

    const current = await prisma.programmeCurriculumVersion.findUniqueOrThrow({
      where: { id: versionId },
      select: { competencyFrameworkVersionId: true },
    });
    if (current.competencyFrameworkVersionId === frameworkVersionId) return context;

    await prisma.$transaction(async (tx) => {
      await tx.programmeCurriculumVersion.update({
        where: { id: versionId },
        data: {
          competencyFrameworkVersionId: frameworkVersionId,
          competencyFrameworkAssignedById: actorId,
          competencyFrameworkAssignedAt: new Date(),
        },
      });
      await tx.programmeCurriculumAuditAction.create({
        data: {
          curriculumVersionId: versionId,
          actorId,
          action: "MetadataUpdated",
          note: "Competency framework version assigned",
          details: {
            previousFrameworkVersionId: current.competencyFrameworkVersionId,
            frameworkVersionId,
            frameworkCode: framework.framework.code,
            frameworkVersion: framework.version,
          },
        },
      });
    });
    return context;
  },

  async getBindingForCurriculumVersion(versionId: string) {
    const row = await prisma.programmeCurriculumVersion.findUnique({
      where: { id: versionId },
      select: {
        competencyFrameworkAssignedById: true,
        competencyFrameworkAssignedAt: true,
        competencyFrameworkVersion: { include: frameworkVersionInclude },
      },
    });
    if (!row?.competencyFrameworkVersion) return null;
    if (!row.competencyFrameworkAssignedById || !row.competencyFrameworkAssignedAt) {
      throw new InvalidCompetencyFrameworkAssignmentError(
        "Curriculum competency framework provenance is incomplete",
      );
    }
    return {
      ...toFrameworkVersionView(row.competencyFrameworkVersion),
      assignedById: row.competencyFrameworkAssignedById,
      assignedAt: row.competencyFrameworkAssignedAt.toISOString(),
    };
  },
};

export type CompetencyFrameworkService = typeof competencyFrameworkService;
