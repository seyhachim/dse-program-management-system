import {
  AUN_QA_V4_ID,
  CreateQaEvidenceAnalysisSchema,
  QaApplicabilityStateSchema,
  QaAnalysisReasoningFactorsSchema,
  QaEvidenceAnalysisSourceKindSchema,
  QaEvidenceAnalysisStateSchema,
  QaEvidenceProvenanceSchema,
  QaEvidenceScopeSchema,
  QaEvidenceSourceDomainSchema,
  QaScopeMatchSchema,
  QaTemporalMatchSchema,
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

type AnalysisSemanticsRow = {
  id: string;
  applicability: string;
  applicabilityReason: string;
  reasoningFactors: unknown;
};

type SourceSemanticsRow = {
  id: string;
  scope: unknown;
  scopeMatch: string;
  temporalMatch: string;
  provenance: unknown;
  authorityMatch: boolean | null;
  periodKey: string | null;
};

function sourceToView(
  source: {
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
  },
  semantics?: SourceSemanticsRow,
): QaEvidenceAnalysisSourceView {
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
    scope: QaEvidenceScopeSchema.parse(semantics?.scope ?? {}),
    scopeMatch: QaScopeMatchSchema.parse(semantics?.scopeMatch ?? "unknown"),
    temporalMatch: QaTemporalMatchSchema.parse(semantics?.temporalMatch ?? "unknown"),
    provenance: QaEvidenceProvenanceSchema.parse(
      semantics?.provenance ?? { authority: "unknown" },
    ),
    authorityMatch: semantics?.authorityMatch ?? null,
    periodKey: semantics?.periodKey ?? null,
    createdAt: source.createdAt.toISOString(),
  };
}

function analysisToView(
  analysis: {
    id: string;
    programmeId: string;
    cycleId: string;
    expectationId: string;
    state: keyof typeof fromDbState | null;
    explanation: string;
    confidence: number | null;
    uncertaintyNote: string;
    engine: string;
    engineVersion: string;
    promptVersion: string;
    createdAt: Date;
    requirement: { code: string };
    sources: Array<Parameters<typeof sourceToView>[0]>;
  },
  semantics: AnalysisSemanticsRow | undefined,
  sourceSemantics: Map<string, SourceSemanticsRow>,
): QaEvidenceAnalysisView {
  const state = analysis.state
    ? QaEvidenceAnalysisStateSchema.parse(fromDbState[analysis.state])
    : null;
  return {
    id: analysis.id,
    programmeId: analysis.programmeId,
    cycleId: analysis.cycleId,
    requirementCode: analysis.requirement.code,
    expectationId: analysis.expectationId,
    applicability: QaApplicabilityStateSchema.parse(semantics?.applicability ?? "applicable"),
    applicabilityReason: semantics?.applicabilityReason ?? "",
    state,
    explanation: analysis.explanation,
    confidence: analysis.confidence,
    uncertaintyNote: analysis.uncertaintyNote,
    engine: analysis.engine,
    engineVersion: analysis.engineVersion,
    promptVersion: analysis.promptVersion,
    reasoningFactors: QaAnalysisReasoningFactorsSchema.parse(semantics?.reasoningFactors ?? { evidence: [], relationships: [] }),
    createdAt: analysis.createdAt.toISOString(),
    sources: analysis.sources.map((source) => sourceToView(source, sourceSemantics.get(source.id))),
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
    const evidenceMappings = await prisma.qaEvidenceMapping.findMany({
      where: {
        programmeId: input.programmeId,
        cycleId: input.cycleId,
        requirementId: requirement.id,
        evidenceId: { in: qaEvidenceIds },
      },
      select: { evidenceId: true },
    });
    const allowed = new Set(evidenceMappings.map((row) => row.evidenceId));
    const invalidId = qaEvidenceIds.find((id) => !allowed.has(id));
    if (invalidId) {
      throw new QaAnalysisScopeMismatchError(
        "Analysis source references QA evidence that is not mapped to this programme, cycle, or requirement",
      );
    }
  }

  const createdId = await prisma.$transaction(async (tx) => {
    const created = await tx.qaEvidenceAnalysis.create({
      data: {
        programmeId: input.programmeId,
        cycleId: input.cycleId,
        requirementId: requirement.id,
        expectationId: expectation.id,
        // Prisma's generated model predates the nullable DB column. The placeholder
        // is transaction-local and is nulled below before commit when applicability
        // bypasses coverage classification.
        state: toDbState[input.state ?? "expertReviewRequired"],
        explanation: input.explanation,
        confidence: input.confidence,
        uncertaintyNote: input.uncertaintyNote,
        engine: input.engine,
        engineVersion: input.engineVersion,
        promptVersion: input.promptVersion,
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
      include: { sources: true },
    });

    if (input.applicability === "applicable") {
      await tx.$executeRaw`
        UPDATE "QaEvidenceAnalysis"
        SET "applicability" = ${input.applicability},
            "applicabilityReason" = ${input.applicabilityReason},
            "reasoningFactors" = CAST(${JSON.stringify(input.reasoningFactors)} AS jsonb)
        WHERE id = ${created.id}
      `;
    } else {
      await tx.$executeRaw`
        UPDATE "QaEvidenceAnalysis"
        SET "applicability" = ${input.applicability},
            "applicabilityReason" = ${input.applicabilityReason},
            "reasoningFactors" = CAST(${JSON.stringify(input.reasoningFactors)} AS jsonb),
            state = NULL
        WHERE id = ${created.id}
      `;
    }

    const inputByKey = new Map(input.sources.map((source) => [source.candidateKey, source]));
    for (const stored of created.sources) {
      const source = inputByKey.get(stored.candidateKey);
      if (!source) continue;
      await tx.$executeRaw`
        UPDATE "QaEvidenceAnalysisSource"
        SET scope = CAST(${JSON.stringify(source.scope)} AS jsonb),
            "scopeMatch" = ${source.scopeMatch},
            "temporalMatch" = ${source.temporalMatch},
            provenance = CAST(${JSON.stringify(source.provenance)} AS jsonb),
            "authorityMatch" = ${source.authorityMatch},
            "periodKey" = ${source.periodKey}
        WHERE id = ${stored.id}
      `;
    }
    return created.id;
  });

  const rows = await listQaEvidenceAnalyses(
    input.programmeId,
    input.cycleId,
    input.requirementCode,
  );
  const created = rows.find((row) => row.id === createdId);
  if (!created) throw new QaAnalysisResourceNotFoundError("Created QA analysis could not be reloaded");
  return created;
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

  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const analysisSemantics = await prisma.$queryRaw<AnalysisSemanticsRow[]>`
    SELECT id, applicability, "applicabilityReason", "reasoningFactors"
    FROM "QaEvidenceAnalysis"
    WHERE id = ANY(${ids}::text[])
  `;
  const sourceSemantics = await prisma.$queryRaw<SourceSemanticsRow[]>`
    SELECT id, scope, "scopeMatch", "temporalMatch", provenance, "authorityMatch", "periodKey"
    FROM "QaEvidenceAnalysisSource"
    WHERE "analysisId" = ANY(${ids}::text[])
  `;
  const analysisMap = new Map(analysisSemantics.map((row) => [row.id, row]));
  const sourceMap = new Map(sourceSemantics.map((row) => [row.id, row]));

  return rows.map((row) =>
    analysisToView(
      row as typeof row & { state: keyof typeof fromDbState | null },
      analysisMap.get(row.id),
      sourceMap,
    ),
  );
}
