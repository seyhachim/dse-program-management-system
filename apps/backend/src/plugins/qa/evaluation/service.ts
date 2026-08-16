import {
  AUN_QA_V4_ID,
  QaEvidenceAnalysisStateSchema,
  QaEvidenceSourceDomainSchema,
  type CreateQaEvaluationHumanRatingSchema,
  type CreateQaEvaluationRunSchema,
  type CreateQaEvaluationScenarioSchema,
  type QaEvaluationHumanRatingView,
  type QaEvaluationRunView,
  type QaEvaluationScenarioView,
  type SetQaEvaluationGoldSchema,
} from "@dse-pms/shared-types";
import type { z } from "zod";
import { prisma } from "../../../core/db/prisma.ts";
import { calculateQaEvaluationMetrics } from "./metrics.ts";

const toDbState = {
  evidenceIdentified: "EvidenceIdentified",
  potentialEvidenceGap: "PotentialEvidenceGap",
  expertReviewRequired: "ExpertReviewRequired",
} as const;

const fromDbState = {
  EvidenceIdentified: "evidenceIdentified",
  PotentialEvidenceGap: "potentialEvidenceGap",
  ExpertReviewRequired: "expertReviewRequired",
} as const;

type CreateScenarioInput = z.infer<typeof CreateQaEvaluationScenarioSchema>;
type SetGoldInput = z.infer<typeof SetQaEvaluationGoldSchema>;
type CreateRunInput = z.infer<typeof CreateQaEvaluationRunSchema>;
type CreateHumanRatingInput = z.infer<typeof CreateQaEvaluationHumanRatingSchema>;

export class QaEvaluationResourceNotFoundError extends Error {}
export class QaEvaluationScopeMismatchError extends Error {}
export class QaEvaluationIntegrityError extends Error {}

function controlledAttributes(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) =>
      item === null || ["string", "number", "boolean"].includes(typeof item),
    ),
  ) as Record<string, string | number | boolean | null>;
}

function scenarioToView(row: any): QaEvaluationScenarioView {
  return {
    id: row.id,
    requirementCode: row.requirement.code,
    expectationId: row.expectationId,
    name: row.name,
    description: row.description,
    goldState: row.goldState
      ? QaEvidenceAnalysisStateSchema.parse(fromDbState[row.goldState as keyof typeof fromDbState])
      : null,
    goldReviewerId: row.goldReviewerId,
    goldReviewerName: row.goldReviewer?.name ?? null,
    goldAnnotatedAt: row.goldAnnotatedAt?.toISOString() ?? null,
    goldNote: row.goldNote,
    evidence: row.evidence.map((item: any) => ({
      id: item.id,
      scenarioId: item.scenarioId,
      order: item.order,
      evidenceType: item.evidenceType,
      sourceDomain: QaEvidenceSourceDomainSchema.parse(item.sourceDomain),
      entityType: item.entityType,
      label: item.label,
      text: item.text,
      referenceKey: item.referenceKey,
      reportingDate: item.reportingDate?.toISOString() ?? null,
      attributes: controlledAttributes(item.attributes),
      goldRelevant: item.goldRelevant,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function runToView(row: any): QaEvaluationRunView {
  return {
    id: row.id,
    scenarioId: row.scenarioId,
    predictedState: QaEvidenceAnalysisStateSchema.parse(
      fromDbState[row.predictedState as keyof typeof fromDbState],
    ),
    engine: row.engine,
    engineVersion: row.engineVersion,
    promptVersion: row.promptVersion,
    explanation: row.explanation,
    createdAt: row.createdAt.toISOString(),
    retrievedEvidence: row.retrieved.map((item: any) => ({
      scenarioEvidenceId: item.scenarioEvidenceId,
      relevance: item.relevance,
    })),
  };
}

function ratingToView(row: any): QaEvaluationHumanRatingView {
  return {
    id: row.id,
    runId: row.runId,
    reviewerId: row.reviewerId,
    reviewerName: row.reviewer.name,
    evidenceRelevance: row.evidenceRelevance,
    explanationClarity: row.explanationClarity,
    understandability: row.understandability,
    usefulness: row.usefulness,
    traceability: row.traceability,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createQaEvaluationScenario(
  input: CreateScenarioInput,
): Promise<QaEvaluationScenarioView> {
  const [requirement, expectation] = await Promise.all([
    prisma.qaRequirement.findFirst({
      where: { code: input.requirementCode, criterion: { frameworkId: AUN_QA_V4_ID } },
      select: { id: true },
    }),
    prisma.qaQualityExpectation.findUnique({
      where: { id: input.expectationId },
      select: {
        id: true,
        requirementId: true,
        active: true,
        expectedEvidence: { select: { evidenceType: true } },
      },
    }),
  ]);
  if (!requirement || !expectation) {
    throw new QaEvaluationResourceNotFoundError("QA requirement or quality expectation not found");
  }
  if (!expectation.active || expectation.requirementId !== requirement.id) {
    throw new QaEvaluationScopeMismatchError(
      "Evaluation expectation does not belong to the selected AUN-QA requirement",
    );
  }

  const allowedEvidenceTypes = new Set(expectation.expectedEvidence.map((item) => item.evidenceType));
  const invalidEvidenceType = input.evidence.find(
    (item) => item.evidenceType !== "" && !allowedEvidenceTypes.has(item.evidenceType),
  );
  if (invalidEvidenceType) {
    throw new QaEvaluationScopeMismatchError(
      `Controlled evidence type ${invalidEvidenceType.evidenceType} is not registered for the selected quality expectation`,
    );
  }

  const created = await prisma.qaEvaluationScenario.create({
    data: {
      requirementId: requirement.id,
      expectationId: expectation.id,
      name: input.name,
      description: input.description,
      evidence: {
        create: input.evidence.map((item, order) => ({
          order,
          evidenceType: item.evidenceType,
          sourceDomain: item.sourceDomain,
          entityType: item.entityType,
          label: item.label,
          text: item.text,
          referenceKey: item.referenceKey,
          reportingDate: item.reportingDate,
          attributes: item.attributes,
        })),
      },
    },
    include: {
      requirement: { select: { code: true } },
      expectation: { select: { id: true } },
      goldReviewer: { select: { name: true } },
      evidence: { orderBy: { order: "asc" } },
    },
  });
  return scenarioToView(created);
}

export async function listQaEvaluationScenarios(): Promise<QaEvaluationScenarioView[]> {
  const rows = await prisma.qaEvaluationScenario.findMany({
    orderBy: [{ requirement: { code: "asc" } }, { createdAt: "asc" }],
    include: {
      requirement: { select: { code: true } },
      expectation: { select: { id: true } },
      goldReviewer: { select: { name: true } },
      evidence: { orderBy: { order: "asc" } },
    },
  });
  return rows.map(scenarioToView);
}

export async function setQaEvaluationGold(
  scenarioId: string,
  input: SetGoldInput,
  reviewerId: string,
): Promise<QaEvaluationScenarioView> {
  const scenario = await prisma.qaEvaluationScenario.findUnique({
    where: { id: scenarioId },
    include: { evidence: { select: { id: true } } },
  });
  if (!scenario) throw new QaEvaluationResourceNotFoundError("Evaluation scenario not found");
  if (scenario.goldState !== null) {
    throw new QaEvaluationIntegrityError(
      "Gold reference classification is already established; create a new controlled scenario instead of overwriting the human reference label",
    );
  }

  const evidenceIds = new Set(scenario.evidence.map((item) => item.id));
  const invalid = input.evidenceJudgments.find((item) => !evidenceIds.has(item.evidenceId));
  if (invalid) {
    throw new QaEvaluationScopeMismatchError(
      "Gold evidence judgment references evidence outside this evaluation scenario",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.qaEvaluationScenario.update({
      where: { id: scenarioId },
      data: {
        goldState: toDbState[input.goldState],
        goldReviewerId: reviewerId,
        goldAnnotatedAt: new Date(),
        goldNote: input.note,
      },
    });
    await tx.qaEvaluationScenarioEvidence.updateMany({
      where: { scenarioId },
      data: { goldRelevant: null },
    });
    for (const judgment of input.evidenceJudgments) {
      await tx.qaEvaluationScenarioEvidence.update({
        where: { id: judgment.evidenceId },
        data: { goldRelevant: judgment.relevant },
      });
    }
  });

  const updated = await prisma.qaEvaluationScenario.findUniqueOrThrow({
    where: { id: scenarioId },
    include: {
      requirement: { select: { code: true } },
      expectation: { select: { id: true } },
      goldReviewer: { select: { name: true } },
      evidence: { orderBy: { order: "asc" } },
    },
  });
  return scenarioToView(updated);
}

/** Internal persistence for an actual prototype run. This is intentionally not
 * exposed as a client-write route; #194 calls it from the controlled runner. */
export async function createQaEvaluationRun(
  input: CreateRunInput,
): Promise<QaEvaluationRunView> {
  const scenario = await prisma.qaEvaluationScenario.findUnique({
    where: { id: input.scenarioId },
    include: { evidence: { select: { id: true } } },
  });
  if (!scenario) throw new QaEvaluationResourceNotFoundError("Evaluation scenario not found");
  const evidenceIds = new Set(scenario.evidence.map((item) => item.id));
  const invalid = input.retrievedEvidence.find((item) => !evidenceIds.has(item.scenarioEvidenceId));
  if (invalid) {
    throw new QaEvaluationScopeMismatchError(
      "Evaluation run references evidence outside its controlled scenario",
    );
  }

  const created = await prisma.qaEvaluationRun.create({
    data: {
      scenarioId: input.scenarioId,
      predictedState: toDbState[input.predictedState],
      engine: input.engine,
      engineVersion: input.engineVersion,
      promptVersion: input.promptVersion,
      explanation: input.explanation,
      retrieved: {
        create: input.retrievedEvidence.map((item) => ({
          scenarioEvidenceId: item.scenarioEvidenceId,
          relevance: item.relevance,
        })),
      },
    },
    include: { retrieved: true },
  });
  return runToView(created);
}

export async function listQaEvaluationRuns(filters: {
  engine?: string;
  engineVersion?: string;
  promptVersion?: string;
} = {}): Promise<QaEvaluationRunView[]> {
  const rows = await prisma.qaEvaluationRun.findMany({
    where: {
      ...(filters.engine ? { engine: filters.engine } : {}),
      ...(filters.engineVersion ? { engineVersion: filters.engineVersion } : {}),
      ...(filters.promptVersion !== undefined ? { promptVersion: filters.promptVersion } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { retrieved: true },
  });
  return rows.map(runToView);
}

export async function createQaEvaluationHumanRating(
  runId: string,
  input: CreateHumanRatingInput,
  reviewerId: string,
): Promise<QaEvaluationHumanRatingView> {
  const run = await prisma.qaEvaluationRun.findUnique({ where: { id: runId }, select: { id: true } });
  if (!run) throw new QaEvaluationResourceNotFoundError("Evaluation run not found");
  const existing = await prisma.qaEvaluationHumanRating.findUnique({
    where: { runId_reviewerId: { runId, reviewerId } },
    select: { id: true },
  });
  if (existing) {
    throw new QaEvaluationIntegrityError(
      "This reviewer has already rated the evaluation run; preserve the original research annotation",
    );
  }

  const created = await prisma.qaEvaluationHumanRating.create({
    data: { runId, reviewerId, ...input },
    include: { reviewer: { select: { name: true } } },
  });
  return ratingToView(created);
}

export async function getQaEvaluationMetrics(filters: {
  engine?: string;
  engineVersion?: string;
  promptVersion?: string;
} = {}) {
  const runs = await prisma.qaEvaluationRun.findMany({
    where: {
      ...(filters.engine ? { engine: filters.engine } : {}),
      ...(filters.engineVersion ? { engineVersion: filters.engineVersion } : {}),
      ...(filters.promptVersion !== undefined ? { promptVersion: filters.promptVersion } : {}),
    },
    include: {
      scenario: { include: { evidence: { select: { id: true, goldRelevant: true } } } },
      retrieved: { include: { scenarioEvidence: { select: { goldRelevant: true } } } },
    },
  });
  const ratings = await prisma.qaEvaluationHumanRating.findMany({
    where: {
      run: {
        ...(filters.engine ? { engine: filters.engine } : {}),
        ...(filters.engineVersion ? { engineVersion: filters.engineVersion } : {}),
        ...(filters.promptVersion !== undefined ? { promptVersion: filters.promptVersion } : {}),
      },
    },
    select: {
      evidenceRelevance: true,
      explanationClarity: true,
      understandability: true,
      usefulness: true,
      traceability: true,
    },
  });

  return calculateQaEvaluationMetrics(
    runs.map((run) => ({
      predictedState: QaEvidenceAnalysisStateSchema.parse(
        fromDbState[run.predictedState as keyof typeof fromDbState],
      ),
      goldState: run.scenario.goldState
        ? QaEvidenceAnalysisStateSchema.parse(
            fromDbState[run.scenario.goldState as keyof typeof fromDbState],
          )
        : null,
      retrievedEvidence: run.retrieved.map((item) => ({
        goldRelevant: item.scenarioEvidence.goldRelevant,
      })),
      goldRelevantEvidenceCount: run.scenario.evidence.filter((item) => item.goldRelevant === true).length,
    })),
    ratings,
  );
}

export async function exportQaEvaluationData() {
  const [scenarios, runs, ratings] = await Promise.all([
    listQaEvaluationScenarios(),
    listQaEvaluationRuns(),
    prisma.qaEvaluationHumanRating.findMany({
      orderBy: { createdAt: "asc" },
      include: { reviewer: { select: { name: true } } },
    }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    frameworkId: AUN_QA_V4_ID,
    scenarios,
    runs,
    humanRatings: ratings.map(ratingToView),
  };
}
