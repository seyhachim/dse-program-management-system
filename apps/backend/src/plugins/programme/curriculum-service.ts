import { Prisma } from "@prisma/client";
import type {
  CreateCurriculumRevisionInput,
  CreateInitialCurriculumInput,
  ProgrammeCurriculumRead,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { formatProgrammeCurriculumVersion } from "./curriculum-domain.ts";

const versionSelect = {
  id: true,
  versionMajor: true,
  versionMinor: true,
  status: true,
  revisionType: true,
  revisionTriggers: true,
  revisionReason: true,
  changeSummary: true,
  basedOnVersionId: true,
  cohortLabel: true,
  intakeYear: true,
  academicYear: true,
  effectiveFrom: true,
  approvedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toVersionSummary(version: {
  id: string;
  versionMajor: number;
  versionMinor: number;
  status: "Draft" | "Approved" | "Active" | "Superseded";
  revisionType: "Initial" | "Minor" | "Major";
  revisionTriggers: Array<
    | "ScheduledReview"
    | "StudentFeedback"
    | "AlumniFeedback"
    | "EmployerFeedback"
    | "LecturerReflection"
    | "ProgrammeCoordinator"
    | "ExternalExaminer"
    | "QaFinding"
    | "RegulatoryChange"
    | "Other"
  >;
  revisionReason: string;
  changeSummary: string;
  basedOnVersionId: string | null;
  cohortLabel: string;
  intakeYear: number | null;
  academicYear: string;
  effectiveFrom: Date | null;
  approvedAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...version,
    version: formatProgrammeCurriculumVersion(
      version.versionMajor,
      version.versionMinor,
    ),
    effectiveFrom: toIsoDate(version.effectiveFrom),
    approvedAt: version.approvedAt?.toISOString() ?? null,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
  };
}

function parseEffectiveFrom(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

export class CurriculumNotFoundError extends Error {}
export class CurriculumConflictError extends Error {}
export class InvalidCurriculumRevisionError extends Error {}

export const curriculumService = {
  async listForProgramme(programmeId: string) {
    return prisma.programmeCurriculum.findMany({
      where: { programmeId },
      orderBy: [{ createdAt: "asc" }, { code: "asc" }],
      select: {
        id: true,
        programmeId: true,
        code: true,
        name: true,
        versions: {
          orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
          select: versionSelect,
        },
      },
    }).then((curricula) =>
      curricula.map((curriculum) => ({
        ...curriculum,
        versions: curriculum.versions.map(toVersionSummary),
      })),
    );
  },

  async createInitial(
    programmeId: string,
    actorId: string,
    input: CreateInitialCurriculumInput,
  ): Promise<ProgrammeCurriculumRead> {
    const programme = await prisma.programme.findUnique({
      where: { id: programmeId },
      select: { id: true },
    });
    if (!programme) throw new CurriculumNotFoundError("Programme not found");

    let curriculumId: string;
    try {
      curriculumId = await prisma.$transaction(async (tx) => {
        const curriculum = await tx.programmeCurriculum.create({
          data: {
            programmeId,
            code: input.code,
            name: input.name,
          },
          select: { id: true },
        });

        const version = await tx.programmeCurriculumVersion.create({
          data: {
            curriculumId: curriculum.id,
            versionMajor: 1,
            versionMinor: 0,
            status: "Draft",
            revisionType: "Initial",
            revisionTriggers: [],
            revisionReason: "",
            changeSummary: "",
            cohortLabel: input.cohortLabel,
            intakeYear: input.intakeYear ?? null,
            academicYear: input.academicYear,
            effectiveFrom: parseEffectiveFrom(input.effectiveFrom) ?? null,
            createdById: actorId,
          },
          select: { id: true },
        });

        await tx.programmeCurriculumAuditAction.create({
          data: {
            curriculumVersionId: version.id,
            actorId,
            action: "Created",
            note: "Initial curriculum draft created",
            details: {
              version: "1.0",
              revisionType: "Initial",
            },
          },
        });

        return curriculum.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CurriculumConflictError(
          "A curriculum with this code already exists for the programme",
        );
      }
      throw error;
    }

    return this.getById(curriculumId);
  },

  async createRevision(
    curriculumId: string,
    predecessorVersionId: string,
    actorId: string,
    input: CreateCurriculumRevisionInput,
  ): Promise<ProgrammeCurriculumRead> {
    const predecessor = await prisma.programmeCurriculumVersion.findUnique({
      where: { id: predecessorVersionId },
      include: {
        curriculum: { select: { id: true } },
        courses: {
          orderBy: [{ yearLevel: "asc" }, { semester: "asc" }, { sortOrder: "asc" }],
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

    if (!predecessor || predecessor.curriculumId !== curriculumId) {
      throw new CurriculumNotFoundError("Curriculum predecessor version not found");
    }
    if (predecessor.status !== "Approved" && predecessor.status !== "Active") {
      throw new InvalidCurriculumRevisionError(
        "Curriculum revisions can only be created from Approved or Active versions",
      );
    }

    let newVersionId: string;
    try {
      newVersionId = await prisma.$transaction(
        async (tx) => {
          let versionMajor: number;
          let versionMinor: number;

          if (input.revisionType === "Minor") {
            versionMajor = predecessor.versionMajor;
            const latest = await tx.programmeCurriculumVersion.aggregate({
              where: { curriculumId, versionMajor },
              _max: { versionMinor: true },
            });
            versionMinor = (latest._max.versionMinor ?? predecessor.versionMinor) + 1;
          } else {
            const latest = await tx.programmeCurriculumVersion.aggregate({
              where: { curriculumId },
              _max: { versionMajor: true },
            });
            versionMajor = (latest._max.versionMajor ?? predecessor.versionMajor) + 1;
            versionMinor = 0;
          }

          const version = await tx.programmeCurriculumVersion.create({
            data: {
              curriculumId,
              versionMajor,
              versionMinor,
              status: "Draft",
              revisionType: input.revisionType,
              revisionTriggers: input.revisionTriggers,
              revisionReason: input.revisionReason,
              changeSummary: input.changeSummary,
              basedOnVersionId: predecessor.id,
              cohortLabel: input.cohortLabel ?? predecessor.cohortLabel,
              intakeYear:
                input.intakeYear === undefined
                  ? predecessor.intakeYear
                  : input.intakeYear,
              academicYear: input.academicYear ?? predecessor.academicYear,
              effectiveFrom:
                input.effectiveFrom === undefined
                  ? predecessor.effectiveFrom
                  : parseEffectiveFrom(input.effectiveFrom),
              createdById: actorId,
            },
            select: { id: true },
          });

          if (predecessor.courses.length > 0) {
            await tx.programmeCurriculumCourse.createMany({
              data: predecessor.courses.map((placement) => ({
                curriculumVersionId: version.id,
                courseId: placement.courseId,
                yearLevel: placement.yearLevel,
                semester: placement.semester,
                creditsSnapshot: placement.creditsSnapshot,
                courseTypeSnapshot: placement.courseTypeSnapshot,
                sortOrder: placement.sortOrder,
              })),
            });
          }

          await tx.programmeCurriculumAuditAction.create({
            data: {
              curriculumVersionId: version.id,
              actorId,
              action: "Created",
              note: `${input.revisionType} curriculum revision created`,
              details: {
                basedOnVersionId: predecessor.id,
                version: formatProgrammeCurriculumVersion(versionMajor, versionMinor),
                revisionType: input.revisionType,
                revisionTriggers: input.revisionTriggers,
              },
            },
          });

          return version.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CurriculumConflictError(
          "Curriculum version number changed concurrently; retry the revision request",
        );
      }
      throw error;
    }

    return this.getById(curriculumId, newVersionId);
  },

  async getById(
    curriculumId: string,
    requestedVersionId?: string,
  ): Promise<ProgrammeCurriculumRead> {
    const curriculum = await prisma.programmeCurriculum.findUnique({
      where: { id: curriculumId },
      select: {
        id: true,
        programmeId: true,
        code: true,
        name: true,
        versions: {
          orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
          select: versionSelect,
        },
      },
    });
    if (!curriculum || curriculum.versions.length === 0) {
      throw new CurriculumNotFoundError("Curriculum not found");
    }

    const selectedSummary = requestedVersionId
      ? curriculum.versions.find((version) => version.id === requestedVersionId)
      : curriculum.versions.find((version) => version.status === "Active") ??
        curriculum.versions.find((version) => version.status === "Approved") ??
        curriculum.versions[0];

    if (!selectedSummary) {
      throw new CurriculumNotFoundError("Curriculum version not found");
    }

    const placements = await prisma.programmeCurriculumCourse.findMany({
      where: { curriculumVersionId: selectedSummary.id },
      orderBy: [{ yearLevel: "asc" }, { semester: "asc" }, { sortOrder: "asc" }, { courseId: "asc" }],
      select: {
        id: true,
        courseId: true,
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
      },
    });

    const years = [1, 2, 3, 4].map((yearLevel) => {
      const semesters = (["First", "Second"] as const).map((semester) => {
        const courses = placements
          .filter(
            (placement) =>
              placement.yearLevel === yearLevel && placement.semester === semester,
          )
          .map((placement) => ({
            placementId: placement.id,
            courseId: placement.courseId,
            code: placement.course.code,
            title: placement.course.title,
            yearLevel: placement.yearLevel,
            semester: placement.semester,
            credits: placement.creditsSnapshot,
            courseType: placement.courseTypeSnapshot,
            sortOrder: placement.sortOrder,
          }));

        return {
          semester,
          courses,
          totalCredits: courses.reduce((total, course) => total + course.credits, 0),
        };
      });

      return {
        yearLevel,
        semesters,
        totalCredits: semesters.reduce((total, semester) => total + semester.totalCredits, 0),
      };
    });

    const totals = {
      programmeCredits: placements.reduce(
        (total, placement) => total + placement.creditsSnapshot,
        0,
      ),
      basicCredits: 0,
      coreCredits: 0,
      electiveCredits: 0,
      specializationCredits: 0,
      moeysHeipCredits: 0,
    };

    for (const placement of placements) {
      switch (placement.courseTypeSnapshot) {
        case "Basic":
          totals.basicCredits += placement.creditsSnapshot;
          break;
        case "Core":
          totals.coreCredits += placement.creditsSnapshot;
          break;
        case "Elective":
          totals.electiveCredits += placement.creditsSnapshot;
          break;
        case "Specialization":
          totals.specializationCredits += placement.creditsSnapshot;
          break;
        case "MoeysHeip":
          totals.moeysHeipCredits += placement.creditsSnapshot;
          break;
      }
    }

    return {
      curriculum: {
        id: curriculum.id,
        programmeId: curriculum.programmeId,
        code: curriculum.code,
        name: curriculum.name,
      },
      selectedVersion: toVersionSummary(selectedSummary),
      versions: curriculum.versions.map(toVersionSummary),
      years,
      totals,
    };
  },
};

export type CurriculumService = typeof curriculumService;
