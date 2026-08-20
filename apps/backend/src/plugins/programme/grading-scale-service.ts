import type {
  ApproveProgrammeGradingScaleInput,
  CreateProgrammeGradingScaleInput,
  CreateProgrammeGradingScaleRevisionInput,
  DraftGradingScaleGradeInput,
  ProgrammeGradingScale,
  ProgrammeGradingScaleVersion,
  UpdateProgrammeGradingScaleDraftInput,
} from "@dse-pms/shared-types";
import { Prisma, type ProgrammeGradingScaleVersionStatus } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import {
  GradingScaleValidationError,
  gradingScaleScoreLabel,
  validateGradingScaleBands,
} from "./grading-scale-domain.ts";

export class GradingScaleNotFoundError extends Error {}
export class GradingScaleConflictError extends Error {}
export class GradingScaleAuthorizationError extends Error {}

const VERSION_INCLUDE = {
  gradingScale: true,
  grades: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.ProgrammeGradingScaleVersionInclude;

const SCALE_INCLUDE = {
  versions: {
    include: { grades: { orderBy: { sortOrder: "asc" as const } } },
    orderBy: { version: "desc" as const },
  },
} satisfies Prisma.ProgrammeGradingScaleInclude;

type VersionWithScale = Prisma.ProgrammeGradingScaleVersionGetPayload<{
  include: typeof VERSION_INCLUDE;
}>;
type ScaleWithVersions = Prisma.ProgrammeGradingScaleGetPayload<{
  include: typeof SCALE_INCLUDE;
}>;

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function isoDateTime(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function serializeVersion(row: VersionWithScale): ProgrammeGradingScaleVersion {
  return {
    id: row.id,
    gradingScaleId: row.gradingScaleId,
    programmeId: row.gradingScale.programmeId,
    code: row.gradingScale.code,
    name: row.gradingScale.name,
    description: row.gradingScale.description,
    version: row.version,
    status: row.status,
    effectiveFrom: isoDate(row.effectiveFrom),
    effectiveTo: isoDate(row.effectiveTo),
    changeSummary: row.changeSummary,
    basedOnVersionId: row.basedOnVersionId,
    legacyImported: row.legacyImported,
    createdById: row.createdById,
    approvedById: row.approvedById,
    approvedAt: isoDateTime(row.approvedAt),
    supersededAt: isoDateTime(row.supersededAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    grades: row.grades.map((grade) => {
      const values = {
        minScore: Number(grade.minScore),
        maxScore: Number(grade.maxScore),
        minInclusive: grade.minInclusive,
        maxInclusive: grade.maxInclusive,
      };
      return {
        id: grade.id,
        sortOrder: grade.sortOrder,
        letterGrade: grade.letterGrade,
        gradePoint: Number(grade.gradePoint),
        ...values,
        explanation: grade.explanation,
        isPassing: grade.isPassing,
        scoreLabel: gradingScaleScoreLabel(values),
      };
    }),
  };
}

function serializeScale(row: ScaleWithVersions): ProgrammeGradingScale {
  return {
    id: row.id,
    programmeId: row.programmeId,
    code: row.code,
    name: row.name,
    description: row.description,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    versions: row.versions.map((version) =>
      serializeVersion({ ...version, gradingScale: row }),
    ),
  };
}

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

function dateOnlyUtc(value = new Date()): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function versionIsEffectiveOn(
  version: Pick<VersionWithScale, "effectiveFrom" | "effectiveTo">,
  date: Date,
): boolean {
  return (
    (!version.effectiveFrom || version.effectiveFrom <= date) &&
    (!version.effectiveTo || date < version.effectiveTo)
  );
}

function gradeCreateRows(grades: readonly DraftGradingScaleGradeInput[]) {
  return grades.map((grade) => ({
    sortOrder: grade.sortOrder,
    letterGrade: grade.letterGrade.trim(),
    gradePoint: new Prisma.Decimal(grade.gradePoint),
    minScore: new Prisma.Decimal(grade.minScore),
    maxScore: new Prisma.Decimal(grade.maxScore),
    minInclusive: grade.minInclusive,
    maxInclusive: grade.maxInclusive,
    explanation: grade.explanation.trim(),
    isPassing: grade.isPassing,
  }));
}

function versionGradesForValidation(
  version: VersionWithScale,
): DraftGradingScaleGradeInput[] {
  return version.grades.map((grade) => ({
    sortOrder: grade.sortOrder,
    letterGrade: grade.letterGrade,
    gradePoint: Number(grade.gradePoint),
    minScore: Number(grade.minScore),
    maxScore: Number(grade.maxScore),
    minInclusive: grade.minInclusive,
    maxInclusive: grade.maxInclusive,
    explanation: grade.explanation,
    isPassing: grade.isPassing,
  }));
}

async function assertProgrammeExists(programmeId: string) {
  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    select: { id: true },
  });
  if (!programme) {
    throw new GradingScaleNotFoundError("Programme not found");
  }
}

async function getVersionRow(id: string): Promise<VersionWithScale> {
  const version = await prisma.programmeGradingScaleVersion.findUnique({
    where: { id },
    include: VERSION_INCLUDE,
  });
  if (!version) {
    throw new GradingScaleNotFoundError("Grading-scale version not found");
  }
  return version;
}

async function list(programmeId: string): Promise<ProgrammeGradingScale[]> {
  await assertProgrammeExists(programmeId);
  const rows = await prisma.programmeGradingScale.findMany({
    where: { programmeId },
    include: SCALE_INCLUDE,
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return rows.map(serializeScale);
}

async function create(
  actorId: string,
  input: CreateProgrammeGradingScaleInput,
): Promise<ProgrammeGradingScaleVersion> {
  validateGradingScaleBands(input.grades);
  await assertProgrammeExists(input.programmeId);

  try {
    const row = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.programmeGradingScale.count({
        where: { programmeId: input.programmeId },
      });
      const scale = await tx.programmeGradingScale.create({
        data: {
          programmeId: input.programmeId,
          code: input.code.trim(),
          name: input.name.trim(),
          description: input.description.trim(),
          isDefault: existingCount === 0,
        },
      });
      const version = await tx.programmeGradingScaleVersion.create({
        data: {
          gradingScaleId: scale.id,
          version: 1,
          status: "Draft",
          effectiveFrom: toDate(input.effectiveFrom),
          changeSummary: input.changeSummary.trim(),
          createdById: actorId,
          grades: { create: gradeCreateRows(input.grades) },
        },
        include: VERSION_INCLUDE,
      });
      await tx.programmeGradingScaleAuditAction.create({
        data: {
          gradingScaleVersionId: version.id,
          actorId,
          action: "Created",
          note: "Initial grading-scale draft created",
        },
      });
      return version;
    });
    return serializeVersion(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new GradingScaleConflictError(
        "A grading scale with this programme/code already exists",
      );
    }
    throw error;
  }
}

async function createRevision(
  gradingScaleId: string,
  actorId: string,
  input: CreateProgrammeGradingScaleRevisionInput,
): Promise<ProgrammeGradingScaleVersion> {
  const row = await prisma.$transaction(async (tx) => {
    const scale = await tx.programmeGradingScale.findUnique({
      where: { id: gradingScaleId },
      include: {
        versions: {
          include: { grades: { orderBy: { sortOrder: "asc" } } },
          orderBy: { version: "desc" },
        },
      },
    });
    if (!scale) throw new GradingScaleNotFoundError("Grading scale not found");
    if (scale.versions.some((version) => version.status === "Draft")) {
      throw new GradingScaleConflictError(
        "Finish or remove the existing draft before creating another revision",
      );
    }
    const source = scale.versions[0];
    if (!source || source.status === "Draft") {
      throw new GradingScaleConflictError(
        "A revision requires an existing approved grading-scale version",
      );
    }

    const created = await tx.programmeGradingScaleVersion.create({
      data: {
        gradingScaleId,
        version: source.version + 1,
        status: "Draft",
        effectiveFrom: toDate(input.effectiveFrom),
        changeSummary: input.changeSummary.trim(),
        basedOnVersionId: source.id,
        createdById: actorId,
        grades: {
          create: source.grades.map((grade) => ({
            sortOrder: grade.sortOrder,
            letterGrade: grade.letterGrade,
            gradePoint: grade.gradePoint,
            minScore: grade.minScore,
            maxScore: grade.maxScore,
            minInclusive: grade.minInclusive,
            maxInclusive: grade.maxInclusive,
            explanation: grade.explanation,
            isPassing: grade.isPassing,
          })),
        },
      },
      include: VERSION_INCLUDE,
    });
    await tx.programmeGradingScaleAuditAction.create({
      data: {
        gradingScaleVersionId: created.id,
        actorId,
        action: "Created",
        note: `Revision created from grading-scale v${source.version}`,
        details: { basedOnVersionId: source.id },
      },
    });
    return created;
  });
  return serializeVersion(row);
}

async function updateDraft(
  versionId: string,
  actorId: string,
  input: UpdateProgrammeGradingScaleDraftInput,
): Promise<ProgrammeGradingScaleVersion> {
  if (input.grades) validateGradingScaleBands(input.grades);

  const row = await prisma.$transaction(async (tx) => {
    const current = await tx.programmeGradingScaleVersion.findUnique({
      where: { id: versionId },
      include: VERSION_INCLUDE,
    });
    if (!current) {
      throw new GradingScaleNotFoundError("Grading-scale version not found");
    }
    if (current.status !== "Draft" || current.legacyImported) {
      throw new GradingScaleConflictError(
        "Only an ordinary Draft grading-scale version can be edited",
      );
    }

    if (input.grades) {
      await tx.programmeGradingScaleGrade.deleteMany({
        where: { gradingScaleVersionId: versionId },
      });
      await tx.programmeGradingScaleGrade.createMany({
        data: gradeCreateRows(input.grades).map((grade) => ({
          ...grade,
          gradingScaleVersionId: versionId,
        })),
      });
    }

    const updated = await tx.programmeGradingScaleVersion.update({
      where: { id: versionId },
      data: {
        effectiveFrom: toDate(input.effectiveFrom),
        changeSummary: input.changeSummary?.trim(),
      },
      include: VERSION_INCLUDE,
    });

    await tx.programmeGradingScaleAuditAction.create({
      data: {
        gradingScaleVersionId: versionId,
        actorId,
        action: "GradeRowsUpdated",
        note: input.grades
          ? "Draft grading bands updated"
          : "Draft grading-scale metadata updated",
      },
    });
    return updated;
  });

  return serializeVersion(row);
}

async function approve(
  versionId: string,
  actorId: string,
  input: ApproveProgrammeGradingScaleInput,
): Promise<ProgrammeGradingScaleVersion> {
  const current = await getVersionRow(versionId);
  if (current.status !== "Draft") {
    throw new GradingScaleConflictError("Only a Draft grading scale can be approved");
  }
  if (!current.effectiveFrom && !current.legacyImported) {
    throw new GradingScaleValidationError(
      "An effective date is required before approval",
    );
  }
  validateGradingScaleBands(versionGradesForValidation(current));

  const now = new Date();
  const row = await prisma.$transaction(async (tx) => {
    const active = await tx.programmeGradingScaleVersion.findMany({
      where: {
        gradingScaleId: current.gradingScaleId,
        status: "Approved",
        id: { not: versionId },
      },
      select: { id: true, version: true, effectiveFrom: true },
    });

    for (const previous of active) {
      if (
        current.effectiveFrom &&
        previous.effectiveFrom &&
        current.effectiveFrom <= previous.effectiveFrom
      ) {
        throw new GradingScaleValidationError(
          "A grading-scale revision must become effective after the current approved version",
        );
      }
      await tx.programmeGradingScaleVersion.update({
        where: { id: previous.id },
        data: {
          status: "Superseded",
          effectiveTo: current.effectiveFrom,
          supersededAt: now,
        },
      });
      await tx.programmeGradingScaleAuditAction.create({
        data: {
          gradingScaleVersionId: previous.id,
          actorId,
          action: "Superseded",
          note: `Superseded by grading-scale v${current.version}`,
          details: { supersededByVersionId: versionId },
        },
      });
    }

    const approved = await tx.programmeGradingScaleVersion.update({
      where: { id: versionId },
      data: {
        status: "Approved",
        approvedById: actorId,
        approvedAt: now,
      },
      include: VERSION_INCLUDE,
    });
    await tx.programmeGradingScaleAuditAction.create({
      data: {
        gradingScaleVersionId: versionId,
        actorId,
        action: "Approved",
        note: input.note,
      },
    });
    return approved;
  });

  return serializeVersion(row);
}

async function getVersion(versionId: string): Promise<ProgrammeGradingScaleVersion> {
  return serializeVersion(await getVersionRow(versionId));
}

async function courseBinding(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      programmeId: true,
      specs: {
        orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
        take: 1,
        select: { id: true, gradingScaleVersionId: true },
      },
    },
  });
  if (!course) throw new GradingScaleNotFoundError("Course not found");

  const spec = course.specs[0] ?? null;
  let version: VersionWithScale | null = null;
  if (spec?.gradingScaleVersionId) {
    version = await prisma.programmeGradingScaleVersion.findUnique({
      where: { id: spec.gradingScaleVersionId },
      include: VERSION_INCLUDE,
    });
  }

  if (!version) {
    const today = dateOnlyUtc();
    version = await prisma.programmeGradingScaleVersion.findFirst({
      where: {
        status: { in: ["Approved", "Superseded"] },
        gradingScale: { programmeId: course.programmeId, isDefault: true },
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: today } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }] },
        ],
      },
      include: VERSION_INCLUDE,
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
    });
  }

  return {
    courseId,
    courseSpecId: spec?.id ?? null,
    gradingScaleVersion: version ? serializeVersion(version) : null,
  };
}

async function bindCourseSpec(
  courseId: string,
  gradingScaleVersionId: string,
): Promise<ProgrammeGradingScaleVersion> {
  const [course, version] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      select: {
        programmeId: true,
        specs: {
          orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
          take: 1,
          select: { id: true, reviewStatus: true, effectiveFrom: true },
        },
      },
    }),
    getVersionRow(gradingScaleVersionId),
  ]);
  if (!course) throw new GradingScaleNotFoundError("Course not found");
  const spec = course.specs[0];
  if (!spec) throw new GradingScaleNotFoundError("Course Specification not found");
  if (!["Draft", "ChangesRequested"].includes(spec.reviewStatus)) {
    throw new GradingScaleConflictError(
      "The grading-scale binding is locked after Course Specification submission",
    );
  }
  if (version.gradingScale.programmeId !== course.programmeId) {
    throw new GradingScaleAuthorizationError(
      "The grading scale belongs to a different programme",
    );
  }
  const allowedStatuses: ProgrammeGradingScaleVersionStatus[] = [
    "Approved",
    "Superseded",
  ];
  if (!allowedStatuses.includes(version.status)) {
    throw new GradingScaleConflictError(
      "Course Specifications can only bind to approved grading-scale versions",
    );
  }

  const targetDate = spec.effectiveFrom ?? dateOnlyUtc();
  if (!versionIsEffectiveOn(version, targetDate)) {
    throw new GradingScaleConflictError(
      "The grading-scale version is not effective for this Course Specification date",
    );
  }

  await prisma.courseSpec.update({
    where: { id: spec.id },
    data: { gradingScaleVersionId },
  });
  return serializeVersion(version);
}

export const gradingScaleService = {
  list,
  create,
  createRevision,
  updateDraft,
  approve,
  getVersion,
  courseBinding,
  bindCourseSpec,
};
