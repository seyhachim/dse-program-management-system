import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  AUN_QA_V4_ID,
  QaSarBookPart3ViewSchema,
  type QaSarBookPart3AssociationKindSchema,
  type QaSarBookPart3View,
  type UpdateQaSarCriterionSelfRatingInput,
  type UpdateQaSarRequirementSelfRatingInput,
  type UpsertQaSarBookPart3AssociationInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { listQaImprovementActions } from "../actions/service.ts";
import {
  QaSarResourceNotFoundError,
  QaSarScopeMismatchError,
} from "../sar/service.ts";
import { getQaSarBookNarrativeSection } from "./narrative-service.ts";

const evidenceStatus = {
  Draft: "draft",
  Ready: "ready",
  Reviewed: "reviewed",
} as const;

export class QaSarBookPart3ValidationError extends Error {}
export class QaSarBookPart3ConflictError extends Error {}

async function assertCycleScope(programmeId: string, cycleId: string) {
  const cycle = await prisma.qaAssessmentCycle.findUnique({
    where: { id: cycleId },
    select: { id: true, programmeId: true, frameworkId: true },
  });
  if (!cycle) throw new QaSarResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId || cycle.frameworkId !== AUN_QA_V4_ID) {
    throw new QaSarScopeMismatchError("SAR Part 3 does not belong to this programme and AUN-QA cycle");
  }
  return cycle;
}

async function resolveRequirement(code: string) {
  const requirement = await prisma.qaRequirement.findFirst({
    where: { code, criterion: { frameworkId: AUN_QA_V4_ID } },
    select: { id: true, code: true, criterionId: true },
  });
  if (!requirement) throw new QaSarResourceNotFoundError("AUN-QA requirement not found");
  return requirement;
}

async function resolveCriterion(code: string) {
  const criterion = await prisma.qaCriterion.findFirst({
    where: { code, frameworkId: AUN_QA_V4_ID },
    select: { id: true, code: true },
  });
  if (!criterion) throw new QaSarResourceNotFoundError("AUN-QA criterion not found");
  return criterion;
}

async function validateRequirementEvidence(
  programmeId: string,
  cycleId: string,
  requirementId: string,
  evidenceIds: string[],
) {
  if (evidenceIds.length === 0) return;
  const mappings = await prisma.qaEvidenceMapping.findMany({
    where: { programmeId, cycleId, requirementId, evidenceId: { in: evidenceIds } },
    select: { evidenceId: true },
  });
  const allowed = new Set(mappings.map((item) => item.evidenceId));
  const invalid = evidenceIds.find((id) => !allowed.has(id));
  if (invalid) {
    throw new QaSarBookPart3ValidationError(
      "Self-rating evidence must be canonical evidence mapped to this requirement and cycle",
    );
  }
}

async function validateCriterionEvidence(
  programmeId: string,
  cycleId: string,
  criterionId: string,
  evidenceIds: string[],
) {
  if (evidenceIds.length === 0) return;
  const mappings = await prisma.qaEvidenceMapping.findMany({
    where: {
      programmeId,
      cycleId,
      evidenceId: { in: evidenceIds },
      requirement: { criterionId },
    },
    select: { evidenceId: true },
  });
  const allowed = new Set(mappings.map((item) => item.evidenceId));
  const invalid = evidenceIds.find((id) => !allowed.has(id));
  if (invalid) {
    throw new QaSarBookPart3ValidationError(
      "Criterion opinion evidence must be canonical evidence mapped within this criterion and cycle",
    );
  }
}

export async function recordLegacyQaRequirementSelfAssessment(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
  rating: number | null,
  justification: string,
  enteredById: string,
) {
  await assertCycleScope(programmeId, cycleId);
  const requirement = await resolveRequirement(requirementCode);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 7)) {
    throw new QaSarBookPart3ValidationError("Self-rating must be a whole number from 1 to 7");
  }

  await prisma.$transaction(async (tx) => {
    const lockKey = `qa-sar-part3-rating:${cycleId}:${requirement.id}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);
    const latest = await tx.$queryRaw<Array<{ revisionNumber: number }>>(Prisma.sql`
      SELECT "revisionNumber"
      FROM "QaSarBookRequirementRatingRevision"
      WHERE "cycleId" = ${cycleId} AND "requirementId" = ${requirement.id}
      ORDER BY "revisionNumber" DESC LIMIT 1
    `);
    const revisionNumber = (latest[0]?.revisionNumber ?? 0) + 1;
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "QaSarBookRequirementRatingRevision"
        ("id", "programmeId", "cycleId", "requirementId", "revisionNumber", "rating", "justification", "evidenceIds", "enteredById")
      VALUES
        (${randomUUID()}, ${programmeId}, ${cycleId}, ${requirement.id}, ${revisionNumber}, ${rating}, ${justification}, ${[]}::text[], ${enteredById})
    `);
    await tx.qaRequirementAssessment.upsert({
      where: { cycleId_requirementId: { cycleId, requirementId: requirement.id } },
      create: {
        programmeId,
        cycleId,
        requirementId: requirement.id,
        rating,
        narrative: justification,
        reviewerId: enteredById,
      },
      update: {
        programmeId,
        rating,
        narrative: justification,
        reviewerId: enteredById,
      },
    });
  });
}

export async function updateQaSarRequirementSelfRating(
  cycleId: string,
  requirementCode: string,
  input: UpdateQaSarRequirementSelfRatingInput,
  enteredById: string,
) {
  await assertCycleScope(input.programmeId, cycleId);
  const requirement = await resolveRequirement(requirementCode);
  await validateRequirementEvidence(
    input.programmeId,
    cycleId,
    requirement.id,
    input.evidenceIds,
  );

  await prisma.$transaction(async (tx) => {
    const lockKey = `qa-sar-part3-rating:${cycleId}:${requirement.id}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);
    const latest = await tx.$queryRaw<Array<{ revisionNumber: number }>>(Prisma.sql`
      SELECT "revisionNumber"
      FROM "QaSarBookRequirementRatingRevision"
      WHERE "cycleId" = ${cycleId} AND "requirementId" = ${requirement.id}
      ORDER BY "revisionNumber" DESC LIMIT 1
    `);
    const revisionNumber = (latest[0]?.revisionNumber ?? 0) + 1;
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "QaSarBookRequirementRatingRevision"
        ("id", "programmeId", "cycleId", "requirementId", "revisionNumber", "rating", "justification", "evidenceIds", "enteredById")
      VALUES
        (${randomUUID()}, ${input.programmeId}, ${cycleId}, ${requirement.id}, ${revisionNumber}, ${input.rating}, ${input.justification}, ${input.evidenceIds}::text[], ${enteredById})
    `);
    await tx.qaRequirementAssessment.upsert({
      where: { cycleId_requirementId: { cycleId, requirementId: requirement.id } },
      create: {
        programmeId: input.programmeId,
        cycleId,
        requirementId: requirement.id,
        rating: input.rating,
        narrative: input.justification,
        reviewerId: enteredById,
      },
      update: {
        programmeId: input.programmeId,
        rating: input.rating,
        narrative: input.justification,
        reviewerId: enteredById,
      },
    });
  });

  return getQaSarBookPart3(input.programmeId, cycleId);
}

export async function updateQaSarCriterionSelfRating(
  cycleId: string,
  criterionCode: string,
  input: UpdateQaSarCriterionSelfRatingInput,
  enteredById: string,
) {
  await assertCycleScope(input.programmeId, cycleId);
  const criterion = await resolveCriterion(criterionCode);
  await validateCriterionEvidence(input.programmeId, cycleId, criterion.id, input.evidenceIds);

  await prisma.$transaction(async (tx) => {
    const lockKey = `qa-sar-part3-criterion:${cycleId}:${criterion.id}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);
    const latest = await tx.$queryRaw<Array<{ revisionNumber: number }>>(Prisma.sql`
      SELECT "revisionNumber"
      FROM "QaSarBookCriterionRatingRevision"
      WHERE "cycleId" = ${cycleId} AND "criterionId" = ${criterion.id}
      ORDER BY "revisionNumber" DESC LIMIT 1
    `);
    const revisionNumber = (latest[0]?.revisionNumber ?? 0) + 1;
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "QaSarBookCriterionRatingRevision"
        ("id", "programmeId", "cycleId", "criterionId", "revisionNumber", "rating", "opinion", "evidenceIds", "enteredById")
      VALUES
        (${randomUUID()}, ${input.programmeId}, ${cycleId}, ${criterion.id}, ${revisionNumber}, ${input.rating}, ${input.opinion}, ${input.evidenceIds}::text[], ${enteredById})
    `);
  });

  return getQaSarBookPart3(input.programmeId, cycleId);
}

type RatingRow = {
  id: string;
  requirementId: string;
  rating: number | null;
  justification: string;
  evidenceIds: string[];
  revisionNumber: number;
  enteredById: string | null;
  enteredByName: string | null;
  createdAt: Date;
};

type CriterionRatingRow = {
  id: string;
  criterionId: string;
  rating: number;
  opinion: string;
  evidenceIds: string[];
  revisionNumber: number;
  enteredById: string | null;
  enteredByName: string | null;
  createdAt: Date;
};

type AssociationRow = {
  id: string;
  kind: "strength" | "weakness";
  sectionKey: "part3.strengths" | "part3.weaknesses";
  revisionId: string;
  revisionNumber: number;
  criterionCode: string | null;
  criterionTitle: string | null;
  requirementCode: string | null;
  requirementTitle: string | null;
  createdById: string;
  createdByName: string;
  createdAt: Date;
};

async function evidenceMap(ids: string[]) {
  if (ids.length === 0) return new Map();
  const rows = await prisma.qaEvidence.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, status: true },
  });
  return new Map(
    rows.map((row) => [
      row.id,
      { id: row.id, title: row.title, status: evidenceStatus[row.status] },
    ]),
  );
}

export async function getQaSarBookPart3(
  programmeId: string,
  cycleId: string,
): Promise<QaSarBookPart3View> {
  await assertCycleScope(programmeId, cycleId);
  const criteria = await prisma.qaCriterion.findMany({
    where: { frameworkId: AUN_QA_V4_ID },
    orderBy: { order: "asc" },
    include: { requirements: { orderBy: { order: "asc" } } },
  });

  const [requirementRatings, criterionRatings, strength, weakness, actions] = await Promise.all([
    prisma.$queryRaw<RatingRow[]>(Prisma.sql`
      SELECT DISTINCT ON (r."requirementId") r."id", r."requirementId", r."rating", r."justification",
             r."evidenceIds", r."revisionNumber", r."enteredById", u."name" AS "enteredByName", r."createdAt"
      FROM "QaSarBookRequirementRatingRevision" r
      LEFT JOIN "User" u ON u."id" = r."enteredById"
      WHERE r."programmeId" = ${programmeId} AND r."cycleId" = ${cycleId}
      ORDER BY r."requirementId", r."revisionNumber" DESC
    `),
    prisma.$queryRaw<CriterionRatingRow[]>(Prisma.sql`
      SELECT DISTINCT ON (r."criterionId") r."id", r."criterionId", r."rating", r."opinion",
             r."evidenceIds", r."revisionNumber", r."enteredById", u."name" AS "enteredByName", r."createdAt"
      FROM "QaSarBookCriterionRatingRevision" r
      LEFT JOIN "User" u ON u."id" = r."enteredById"
      WHERE r."programmeId" = ${programmeId} AND r."cycleId" = ${cycleId}
      ORDER BY r."criterionId", r."revisionNumber" DESC
    `),
    getQaSarBookNarrativeSection(programmeId, cycleId, "part3.strengths"),
    getQaSarBookNarrativeSection(programmeId, cycleId, "part3.weaknesses"),
    listQaImprovementActions(programmeId, { cycleId }),
  ]);

  const currentRevisionIds = [strength.revisionId, weakness.revisionId].filter(
    (value): value is string => Boolean(value),
  );
  const associations = currentRevisionIds.length
    ? await prisma.$queryRaw<AssociationRow[]>(Prisma.sql`
        SELECT a."id", a."kind", a."sectionKey", a."revisionId", sr."revisionNumber",
               c."code" AS "criterionCode", c."title" AS "criterionTitle",
               r."code" AS "requirementCode", r."title" AS "requirementTitle",
               a."createdById", u."name" AS "createdByName", a."createdAt"
        FROM "QaSarBookPart3Association" a
        JOIN "QaSarBookSectionRevision" sr ON sr."id" = a."revisionId"
        LEFT JOIN "QaCriterion" c ON c."id" = a."criterionId"
        LEFT JOIN "QaRequirement" r ON r."id" = a."requirementId"
        JOIN "User" u ON u."id" = a."createdById"
        WHERE a."programmeId" = ${programmeId} AND a."cycleId" = ${cycleId}
          AND a."revisionId" = ANY(${currentRevisionIds}::text[])
        ORDER BY a."createdAt", a."id"
      `)
    : [];

  const followUpCounts = actions.length
    ? await prisma.$queryRaw<Array<{ actionId: string; count: bigint }>>(Prisma.sql`
        SELECT "actionId", COUNT(*)::bigint AS "count"
        FROM "QaImprovementActionFollowUp"
        WHERE "programmeId" = ${programmeId} AND "actionId" = ANY(${actions.map((a) => a.id)}::text[])
        GROUP BY "actionId"
      `)
    : [];
  const followUpCountByAction = new Map(
    followUpCounts.map((row) => [row.actionId, Number(row.count)]),
  );

  const allEvidenceIds = [
    ...requirementRatings.flatMap((row) => row.evidenceIds),
    ...criterionRatings.flatMap((row) => row.evidenceIds),
  ];
  const evidence = await evidenceMap([...new Set(allEvidenceIds)]);
  const requirementRatingById = new Map(requirementRatings.map((row) => [row.requirementId, row]));
  const criterionRatingById = new Map(criterionRatings.map((row) => [row.criterionId, row]));

  const criterionViews = criteria.map((criterion) => {
    const current = criterionRatingById.get(criterion.id);
    return {
      criterionId: criterion.id,
      criterionCode: criterion.code,
      criterionTitle: criterion.title,
      rating: current?.rating ?? null,
      opinion: current?.opinion ?? "",
      evidence: (current?.evidenceIds ?? []).flatMap((id) => {
        const item = evidence.get(id);
        return item ? [item] : [];
      }),
      enteredBy:
        current?.enteredById && current.enteredByName
          ? { id: current.enteredById, name: current.enteredByName }
          : null,
      updatedAt: current?.createdAt.toISOString() ?? null,
      revisionId: current?.id ?? null,
      revisionNumber: current?.revisionNumber ?? null,
      requirements: criterion.requirements.map((requirement) => {
        const row = requirementRatingById.get(requirement.id);
        return {
          requirementId: requirement.id,
          requirementCode: requirement.code,
          requirementTitle: requirement.title,
          rating: row?.rating ?? null,
          justification: row?.justification ?? "",
          evidence: (row?.evidenceIds ?? []).flatMap((id) => {
            const item = evidence.get(id);
            return item ? [item] : [];
          }),
          enteredBy:
            row?.enteredById && row.enteredByName
              ? { id: row.enteredById, name: row.enteredByName }
              : null,
          updatedAt: row?.createdAt.toISOString() ?? null,
          revisionId: row?.id ?? null,
          revisionNumber: row?.revisionNumber ?? null,
        };
      }),
    };
  });

  return QaSarBookPart3ViewSchema.parse({
    programmeId,
    cycleId,
    generatedAt: new Date().toISOString(),
    note: "Human self-assessment only — ratings are not external assessor scores or an accreditation verdict.",
    criteria: criterionViews,
    associations: associations.map((row) => ({
      id: row.id,
      kind: row.kind,
      sectionKey: row.sectionKey,
      revisionId: row.revisionId,
      revisionNumber: row.revisionNumber,
      criterionCode: row.criterionCode,
      criterionTitle: row.criterionTitle,
      requirementCode: row.requirementCode,
      requirementTitle: row.requirementTitle,
      createdBy: { id: row.createdById, name: row.createdByName },
      createdAt: row.createdAt.toISOString(),
    })),
    improvementActions: actions.map((action) => ({
      id: action.id,
      requirementCode: action.requirementCode,
      plannedAction: action.plannedAction,
      indicator: action.indicator,
      ownerId: action.ownerId,
      ownerName: action.ownerName,
      dueDate: action.dueDate,
      status: action.status,
      result: action.result,
      effectivenessReview: action.effectivenessReview,
      overdue: action.overdue,
      followUpEvidenceCount: followUpCountByAction.get(action.id) ?? 0,
      sourceAnalysisId: action.analysisId,
      sourceReviewId: action.reviewId,
    })),
    readiness: {
      totalRequirements: criterionViews.reduce((sum, item) => sum + item.requirements.length, 0),
      ratedRequirements: criterionViews.reduce(
        (sum, item) => sum + item.requirements.filter((requirement) => requirement.rating !== null).length,
        0,
      ),
      totalCriteria: criterionViews.length,
      ratedCriteria: criterionViews.filter((item) => item.rating !== null).length,
      missingRequirementRatings: criterionViews.flatMap((item) =>
        item.requirements.filter((requirement) => requirement.rating === null).map((requirement) => requirement.requirementCode),
      ),
      missingCriterionRatings: criterionViews.filter((item) => item.rating === null).map((item) => item.criterionCode),
    },
  });
}

export async function addQaSarBookPart3Association(
  cycleId: string,
  input: UpsertQaSarBookPart3AssociationInput,
  createdById: string,
) {
  await assertCycleScope(input.programmeId, cycleId);
  const expectedSection = input.kind === "strength" ? "part3.strengths" : "part3.weaknesses";
  const current = await getQaSarBookNarrativeSection(input.programmeId, cycleId, expectedSection);
  if (!current.revisionId || current.revisionId !== input.revisionId) {
    throw new QaSarBookPart3ConflictError("Link strengths/weaknesses only against the current exact narrative revision");
  }

  let criterionId: string | null = null;
  let requirementId: string | null = null;
  if (input.requirementCode) {
    const requirement = await resolveRequirement(input.requirementCode);
    requirementId = requirement.id;
    criterionId = requirement.criterionId;
    if (input.criterionCode) {
      const criterion = await resolveCriterion(input.criterionCode);
      if (criterion.id !== requirement.criterionId) {
        throw new QaSarBookPart3ValidationError("Requirement does not belong to the selected criterion");
      }
    }
  } else if (input.criterionCode) {
    criterionId = (await resolveCriterion(input.criterionCode)).id;
  }

  if (!criterionId && !requirementId) {
    throw new QaSarBookPart3ValidationError("Choose a criterion or requirement");
  }

  const id = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "QaSarBookPart3Association"
      ("id", "programmeId", "cycleId", "sectionKey", "revisionId", "kind", "criterionId", "requirementId", "createdById")
    VALUES
      (${id}, ${input.programmeId}, ${cycleId}, ${expectedSection}, ${input.revisionId}, ${input.kind}, ${criterionId}, ${requirementId}, ${createdById})
  `);
  return getQaSarBookPart3(input.programmeId, cycleId);
}

export async function deleteQaSarBookPart3Association(
  programmeId: string,
  cycleId: string,
  associationId: string,
) {
  await assertCycleScope(programmeId, cycleId);
  const result = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "QaSarBookPart3Association"
    WHERE "id" = ${associationId} AND "programmeId" = ${programmeId} AND "cycleId" = ${cycleId}
  `);
  if (result === 0) throw new QaSarResourceNotFoundError("Part 3 association not found");
}
