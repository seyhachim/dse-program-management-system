import type {
  CourseSpecCompetencyAlignment,
  CourseSpecCompetencyAlignmentItem,
  CourseSpecCompetencyContext,
  CourseSpecCompetencyExpectation,
  ProgrammeCompetencyContextServiceContract,
  SaveCourseSpecCompetencyEvidenceInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { assertCourseSpecEditable } from "./spec-lock.ts";
import { ReferenceError } from "./service.ts";

function programme(): ProgrammeCompetencyContextServiceContract {
  return registry.get<ProgrammeCompetencyContextServiceContract>("programme").service;
}

const SPEC_ORDER = [
  { versionMajor: "desc" as const },
  { versionMinor: "desc" as const },
];

const include = {
  clos: { orderBy: { order: "asc" as const } },
  weeks: { orderBy: { order: "asc" as const } },
  assessmentItems: {
    orderBy: { order: "asc" as const },
    include: { criterionCloMappings: true },
  },
  competencyEvidence: {
    include: { cloLinks: true },
    orderBy: { competencyCode: "asc" as const },
  },
} as const;

type SpecWithEvidence = NonNullable<
  Awaited<ReturnType<typeof loadSpec>>
>;

async function loadSpec(courseId: string) {
  return prisma.courseSpec.findFirst({
    where: { courseId },
    orderBy: SPEC_ORDER,
    include,
  });
}

function cloCodeMap(spec: SpecWithEvidence) {
  return new Map(spec.clos.map((clo, index) => [clo.id, `CLO${index + 1}`]));
}

function hasStudentApplication(row: SpecWithEvidence["weeks"][number]): boolean {
  if (row.activities.length > 0) return true;
  const structured = row.studentLearningActivities;
  return Array.isArray(structured) && structured.length > 0;
}

function snapshotExpectation(
  row: SpecWithEvidence["competencyEvidence"][number],
): CourseSpecCompetencyExpectation {
  return {
    mappingId: row.sourceMappingId ?? row.id,
    competencyId: row.competencyId,
    code: row.competencyCode,
    name: row.competencyName,
    description: null,
    ploCodes: [],
    teachLevel: row.teachLevel,
    useLevel: row.useLevel,
    assessLevel: row.assessLevel,
    mappingUpdatedAt: row.updatedAt.toISOString(),
  };
}

function evidenceStatus(
  expected: unknown,
  count: number,
): "notExpected" | "evidenced" | "missing" {
  if (expected == null) return "notExpected";
  return count > 0 ? "evidenced" : "missing";
}

function itemFor(
  spec: SpecWithEvidence,
  expectation: CourseSpecCompetencyExpectation,
  context: CourseSpecCompetencyContext,
): CourseSpecCompetencyAlignmentItem {
  const evidence = spec.competencyEvidence.find(
    (row) => row.competencyId === expectation.competencyId,
  );
  const codeById = cloCodeMap(spec);
  const linkedCloIds = evidence?.cloLinks.map((link) => link.cloId) ?? [];
  const linkedCloCodes = linkedCloIds
    .map((id) => codeById.get(id))
    .filter((code): code is string => Boolean(code));
  const linked = new Set(linkedCloCodes);

  const teachingWeeks = spec.weeks
    .filter((week) => week.cloCodes.some((code) => linked.has(code)))
    .map((week) => ({ id: week.id, week: week.week, topic: week.topic }));
  const applicationWeeks = spec.weeks
    .filter(
      (week) =>
        week.cloCodes.some((code) => linked.has(code)) &&
        hasStudentApplication(week),
    )
    .map((week) => ({ id: week.id, week: week.week, topic: week.topic }));
  const assessments = spec.assessmentItems
    .filter(
      (assessment) =>
        assessment.status === "Active" &&
        assessment.cloCodes.some((code) => linked.has(code)),
    )
    .map((assessment) => ({
      id: assessment.id,
      name: assessment.name,
      weight: assessment.weight,
      rubricCriterionCount: assessment.criterionCloMappings.filter((mapping) =>
        linked.has(mapping.cloCode),
      ).length,
    }));

  const source = context.source;
  const stale = Boolean(
    evidence &&
      (!source ||
        evidence.sourceMappingId !== expectation.mappingId ||
        evidence.sourceCurriculumVersionId !== source.curriculumVersionId ||
        evidence.sourcePlacementId !== source.placementId ||
        evidence.sourceFrameworkVersionId !== source.frameworkVersionId ||
        evidence.teachLevel !== expectation.teachLevel ||
        evidence.useLevel !== expectation.useLevel ||
        evidence.assessLevel !== expectation.assessLevel),
  );

  return {
    expectation,
    evidence: evidence
      ? {
          id: evidence.id,
          sourceMappingId: evidence.sourceMappingId,
          sourceCurriculumVersionId: evidence.sourceCurriculumVersionId,
          sourcePlacementId: evidence.sourcePlacementId,
          sourceFrameworkVersionId: evidence.sourceFrameworkVersionId,
          competencyId: evidence.competencyId,
          competencyCode: evidence.competencyCode,
          competencyName: evidence.competencyName,
          teachLevel: evidence.teachLevel,
          useLevel: evidence.useLevel,
          assessLevel: evidence.assessLevel,
          linkedCloIds,
          linkedCloCodes,
          stale,
          createdAt: evidence.createdAt.toISOString(),
          updatedAt: evidence.updatedAt.toISOString(),
        }
      : null,
    teachStatus: evidenceStatus(expectation.teachLevel, teachingWeeks.length),
    useStatus: evidenceStatus(expectation.useLevel, applicationWeeks.length),
    assessStatus: evidenceStatus(expectation.assessLevel, assessments.length),
    teachingWeeks,
    applicationWeeks,
    assessments,
  };
}

function summary(items: CourseSpecCompetencyAlignmentItem[]) {
  const needsAttention = items.filter((item) =>
    [item.teachStatus, item.useStatus, item.assessStatus].includes("missing"),
  ).length;
  return {
    expectedCompetencies: items.length,
    evidencedCompetencies: items.length - needsAttention,
    needsAttention,
  };
}

export const courseSpecCompetencyEvidenceService = {
  async get(courseId: string): Promise<CourseSpecCompetencyAlignment> {
    const spec = await loadSpec(courseId);
    const context = await programme().getCourseSpecCompetencyContext(
      courseId,
      spec?.id ?? null,
    );

    if (!spec) {
      return { context, items: [], summary: summary([]) };
    }

    const expectationByCompetency = new Map(
      context.expectations.map((expectation) => [
        expectation.competencyId,
        expectation,
      ]),
    );
    const expectations = [...context.expectations];

    // Historical CourseSpecs keep their saved evidence visible even when the
    // current programme context is missing, ambiguous, or has moved on.
    for (const evidence of spec.competencyEvidence) {
      if (!expectationByCompetency.has(evidence.competencyId)) {
        expectations.push(snapshotExpectation(evidence));
      }
    }

    const items = expectations.map((expectation) =>
      itemFor(spec, expectation, context),
    );
    return { context, items, summary: summary(items) };
  },

  async save(
    courseId: string,
    competencyId: string,
    input: SaveCourseSpecCompetencyEvidenceInput,
  ): Promise<CourseSpecCompetencyAlignment> {
    const spec = await loadSpec(courseId);
    if (!spec) {
      throw new ReferenceError(
        "Start the Course Specification before linking competency evidence",
      );
    }
    assertCourseSpecEditable(spec.reviewStatus);

    const context = await programme().getCourseSpecCompetencyContext(
      courseId,
      spec.id,
    );
    if (context.state !== "ready" || !context.source) {
      throw new ReferenceError(
        context.message || "A unique programme competency context is required",
      );
    }
    const expectation = context.expectations.find(
      (item) => item.competencyId === competencyId,
    );
    if (!expectation) {
      throw new ReferenceError(
        "Competency is not mapped to this course in the authoritative curriculum context",
      );
    }

    const validCloIds = new Set(spec.clos.map((clo) => clo.id));
    const invalidCloId = input.cloIds.find((id) => !validCloIds.has(id));
    if (invalidCloId) {
      throw new ReferenceError(
        "CLO evidence must belong to this Course Specification",
      );
    }

    await prisma.$transaction(async (tx) => {
      const current = await tx.courseSpecCompetencyEvidence.findUnique({
        where: {
          courseSpecId_competencyId: {
            courseSpecId: spec.id,
            competencyId,
          },
        },
        select: { id: true },
      });

      if (input.cloIds.length === 0) {
        if (current) {
          await tx.courseSpecCompetencyEvidence.delete({
            where: { id: current.id },
          });
        }
        return;
      }

      const data = {
        competencyCode: expectation.code,
        competencyName: expectation.name,
        sourceMappingId: expectation.mappingId,
        sourceCurriculumVersionId: context.source!.curriculumVersionId,
        sourcePlacementId: context.source!.placementId,
        sourceFrameworkVersionId: context.source!.frameworkVersionId,
        teachLevel: expectation.teachLevel,
        useLevel: expectation.useLevel,
        assessLevel: expectation.assessLevel,
      };
      const saved = await tx.courseSpecCompetencyEvidence.upsert({
        where: {
          courseSpecId_competencyId: {
            courseSpecId: spec.id,
            competencyId,
          },
        },
        create: {
          courseSpecId: spec.id,
          competencyId,
          ...data,
        },
        update: data,
        select: { id: true },
      });
      await tx.courseSpecCompetencyEvidenceClo.deleteMany({
        where: { evidenceId: saved.id },
      });
      await tx.courseSpecCompetencyEvidenceClo.createMany({
        data: input.cloIds.map((cloId) => ({
          evidenceId: saved.id,
          courseSpecId: spec.id,
          cloId,
        })),
      });
    });

    return this.get(courseId);
  },
};

export type CourseSpecCompetencyEvidenceService =
  typeof courseSpecCompetencyEvidenceService;
