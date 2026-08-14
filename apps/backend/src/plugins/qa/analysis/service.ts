import {
  AUN_QA_V4_ID,
  CreateQaEvidenceAnalysisSchema,
  QaEvidenceAnalysisSourceKindSchema,
  QaEvidenceAnalysisStateSchema,
  QaEvidenceSourceDomainSchema,
  type CreateQaEvidenceAnalysisInput,
  type QaEvidenceAnalysisSourceView,
  type QaEvidenceAnalysisView,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

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

export class QaAnalysisResourceNotFoundError extends Error {}
export class QaAnalysisScopeMismatchError extends Error {}

function sourceToView(source: {
  id: string;
  sourceKind: string;
  candidateKey: string;
  sourceDomain: string;
  entityType: string;
  entityId: string;
  qaEvidenceId: string | null;
  title: string;
  summary: string;
  excerpt: string;
  route: string | null;
  reportingDate: Date | null;
  relevance: number | null;
  createdAt: Date;
}): QaEvidenceAnalysisSourceView {
  const sourceKind = QaEvidenceAnalysisSourceKindSchema.parse(source.sourceKind);
  const sourceDomain = QaEvidenceSourceDomainSchema.parse(source.sourceDomain);
  return {
    id: source.id,
    sourceKind,
    candidateKey: source.candidateKey,
    sourceDomain,
    entityType: source.entityType,
    entityId: source.entityId,
    qaEvidenceId: source.qaEvidenceId,
    title: source.title,
    summary: source.summary,
    excerpt: source.excerpt,
    route: source.route,
    reportingDate: source.reportingDate?.toISOString() ?? null,
    relevance: source.relevance,
    createdAt: source.createdAt.toISOString(),
  };
}

function analysisToView(analysis: {
  id: string;
  programmeId: string;
  cycleId: string;
  expectationId: string;
  state: keyof typeof fromDbState;
  explanation: string;
  confidence: number | null;
  uncertaintyNote: string;
  engine: string;
  engineVersion: string;
  createdAt: Date;
  requirement: { code: string };
  sources: Array<Parameters<typeof sourceToView>[0]>;
}): QaEvidenceAnalysisView {
  const state = QaEvidenceAnalysisStateSchema.parse(fromDbState[analysis.state]);
  return {
    id: analysis.id,
    programmeId: analysis.programmeId,
    cycleId: analysis.cycleId,
    requirementCode: analysis.requirement.code,
    expectationId: analysis.expectationId,
    state,
    explanation: analysis.explanation,
    confidence: analysis.confidence,
    uncertaintyNote: analysis.uncertaintyNote,
    engine: analysis.engine,
    engineVersion: analysis.engineVersion,
    createdAt: analysis.createdAt.toISOString(),
    sources: analysis.sources.map(sourceToView),
  };
}

export async function createQaEvidenceAnalysis(
  rawInput: CreateQaEvidenceAnalysisInput,
): Promise<QaEvidenceAnalysisView> {
  const input = CreateQaEvidenceAnalysisSchema.parse(rawInput);

  const [cycle, requirement, expectation] = await Promise.all([
    prisma.qaAssessmentCycle.findUnique({
      where: { id: input.cycleId },
      select: { id: true, programmeId: true, frameworkId: true },
    }),
    prisma.qaRequirement.findFirst({
      where: {
        code: input.requirementCode,
        criterion: { frameworkId: AUN_QA_V4_ID },
      },
      select: { id: true, code: true },
    }),
    prisma.qaQualityExpectation.findUnique({
      where: { id: input.expectationId },
      select: { id: true, requirementId: true, active: true },
    }),
  ]);

  if (!cycle || !requirement || !expectation) {
    throw new QaAnalysisResourceNotFoundError(
      "QA cycle, requirement, or quality expectation not found",
    );
  }
  if (cycle.programmeId !== input.programmeId || cycle.frameworkId !== AUN_QA_V4_ID) {
    throw new QaAnalysisScopeMismatchError(
      "Analysis does not belong to this programme and AUN-QA cycle",
    );
  }
  if (!expectation.active || expectation.requirementId !== requirement.id) {
    throw new QaAnalysisScopeMismatchError(
      "Quality expectation does not belong to the analysed requirement",
    );
  }

  const qaEvidenceIds = [
    ...new Set(
      input.sources
        .map((source) => source.qaEvidenceId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  if (qaEvidenceIds.length > 0) {
    const evidenceRows = await prisma.qaEvidence.findMany({
      where: {
        id: { in: qaEvidenceIds },
        programmeId: input.programmeId,
        cycleId: input.cycleId,
        requirementId: requirement.id,
      },
      select: { id: true },
    });
    const allowed = new Set(evidenceRows.map((row) => row.id));
    const invalidId = qaEvidenceIds.find((id) => !allowed.has(id));
    if (invalidId) {
      throw new QaAnalysisScopeMismatchError(
        "Analysis source references QA evidence outside this programme, cycle, or requirement",
      );
    }
  }

  const created = await prisma.qaEvidenceAnalysis.create({
    data: {
      programmeId: input.programmeId,
      cycleId: input.cycleId,
      requirementId: requirement.id,
      expectationId: expectation.id,
      state: toDbState[input.state],
      explanation: input.explanation,
      confidence: input.confidence,
      uncertaintyNote: input.uncertaintyNote,
      engine: input.engine,
      engineVersion: input.engineVersion,
      sources: {
        create: input.sources.map((source) => ({
          sourceKind: source.sourceKind,
          candidateKey: source.candidateKey,
          sourceDomain: source.sourceDomain,
          entityType: source.entityType,
          entityId: source.entityId,
          qaEvidenceId: source.qaEvidenceId,
          title: source.title,
          summary: source.summary,
          excerpt: source.excerpt,
          route: source.route,
          reportingDate: source.reportingDate,
          relevance: source.relevance,
        })),
      },
    },
    include: {
      requirement: { select: { code: true } },
      sources: { orderBy: { createdAt: "asc" } },
    },
  });

  return analysisToView(created);
}

export async function listQaEvidenceAnalyses(
  programmeId: string,
  cycleId: string,
  requirementCode?: string,
): Promise<QaEvidenceAnalysisView[]> {
  const cycle = await prisma.qaAssessmentCycle.findUnique({
    where: { id: cycleId },
    select: { programmeId: true, frameworkId: true },
  });
  if (!cycle) throw new QaAnalysisResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId || cycle.frameworkId !== AUN_QA_V4_ID) {
    throw new QaAnalysisScopeMismatchError("Analysis history does not belong to this programme");
  }

  const rows = await prisma.qaEvidenceAnalysis.findMany({
    where: {
      programmeId,
      cycleId,
      ...(requirementCode
        ? {
            requirement: {
              code: requirementCode,
              criterion: { frameworkId: AUN_QA_V4_ID },
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      requirement: { select: { code: true } },
      sources: { orderBy: { createdAt: "asc" } },
    },
  });
  return rows.map(analysisToView);
}
