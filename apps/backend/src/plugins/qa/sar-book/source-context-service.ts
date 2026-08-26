import {
  QaSarRequirementSourceContextSchema,
  type QaEvidenceAnalysisState,
  type QaSarRequirementSourceContext,
  type QaSarSourceBlock,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { getQaEvidenceCandidates } from "../evidence/service.ts";
import { qaService } from "../service.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";

const dbAnalysisState: Record<string, QaEvidenceAnalysisState> = {
  EvidenceIdentified: "evidenceIdentified",
  PotentialEvidenceGap: "potentialEvidenceGap",
  ExpertReviewRequired: "expertReviewRequired",
};

function snapshotKey(expectedEvidenceId: string, keys: string[]): string {
  return `${expectedEvidenceId}:${[...keys].sort().join("|") || "unavailable"}`;
}

function provenanceFor(candidate: Awaited<ReturnType<typeof getQaEvidenceCandidates>>["candidates"][number]) {
  const provenance = candidate.provenance ?? {
    authority: "unknown" as const,
    ownerUnit: null,
    version: null,
    approvalStatus: null,
    sourceUri: candidate.route,
  };
  return {
    sourceDomain: candidate.sourceDomain,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    route: candidate.route,
    authority: provenance.authority,
    ownerUnit: provenance.ownerUnit ?? null,
    version: provenance.version ?? null,
    approvalStatus: provenance.approvalStatus ?? null,
  };
}

async function sourceBlockFor(
  programmeId: string,
  reportingStart: Date,
  reportingEnd: Date,
  definition: {
    id: string;
    evidenceType: string;
    description: string;
    sourceDomain: string;
  },
): Promise<QaSarSourceBlock> {
  const generatedAt = new Date().toISOString();
  try {
    const result = await getQaEvidenceCandidates(programmeId, definition.id);
    const candidates = result.candidates;
    const structured = candidates.filter((candidate) => candidate.sourceKind !== "documentChunk");
    const usable = structured.length > 0 ? structured : candidates;
    return {
      id: `sar-source:${definition.id}`,
      registryKey: `expected-evidence:${definition.id}`,
      kind: "recordList",
      title: definition.evidenceType.replace(/-/g, " "),
      description: definition.description,
      availability: usable.length > 0 ? "available" : "unavailable",
      reportingPeriod: {
        start: reportingStart.toISOString(),
        end: reportingEnd.toISOString(),
        label: `${reportingStart.getUTCFullYear()}–${reportingEnd.getUTCFullYear()}`,
      },
      generatedAt,
      snapshotKey: snapshotKey(definition.id, usable.map((candidate) => candidate.key)),
      provenance: usable.map(provenanceFor),
      message: usable.length > 0 ? result.reason ?? null : result.reason || "No canonical PMS source is currently available for this expected evidence.",
      records: usable.map((candidate) => ({
        key: candidate.key,
        title: candidate.title,
        summary: candidate.summary,
        periodKey: candidate.periodKey ?? null,
      })),
    };
  } catch (error) {
    return {
      id: `sar-source:${definition.id}`,
      registryKey: `expected-evidence:${definition.id}`,
      kind: "recordList",
      title: definition.evidenceType.replace(/-/g, " "),
      description: definition.description,
      availability: "error",
      reportingPeriod: {
        start: reportingStart.toISOString(),
        end: reportingEnd.toISOString(),
        label: `${reportingStart.getUTCFullYear()}–${reportingEnd.getUTCFullYear()}`,
      },
      generatedAt,
      snapshotKey: snapshotKey(definition.id, []),
      provenance: [],
      message: error instanceof Error ? error.message : "Could not resolve this PMS source block.",
      records: [],
    };
  }
}

export async function getQaSarRequirementSourceContext(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<QaSarRequirementSourceContext> {
  const [cycle, knowledge] = await Promise.all([
    prisma.qaAssessmentCycle.findUnique({
      where: { id: cycleId },
      select: {
        programmeId: true,
        reportingStart: true,
        reportingEnd: true,
        framework: {
          select: {
            criteria: {
              select: {
                requirements: {
                  where: { code: requirementCode },
                  select: { id: true, code: true, title: true },
                },
              },
            },
          },
        },
      },
    }),
    qaService.getKnowledge(),
  ]);
  if (!cycle) throw new QaSarResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId) {
    throw new QaSarScopeMismatchError("SAR source context belongs to a different programme");
  }

  const requirement = cycle.framework.criteria
    .flatMap((criterion) => criterion.requirements)
    .find((item) => item.code === requirementCode);
  if (!requirement) throw new QaSarResourceNotFoundError("AUN-QA requirement not found in this cycle");

  const expectations = knowledge.expectations
    .filter((expectation) => expectation.requirementCode === requirementCode)
    .sort((a, b) => a.order - b.order);

  const definitions = expectations.flatMap((expectation) =>
    expectation.expectedEvidence.map((definition) => ({
      id: definition.id,
      evidenceType: definition.evidenceType,
      description: definition.description,
      sourceDomain: definition.sourceDomain,
    })),
  );

  const sourceBlocks = await Promise.all(
    definitions.map((definition) =>
      sourceBlockFor(
        programmeId,
        cycle.reportingStart,
        cycle.reportingEnd,
        definition,
      ),
    ),
  );

  const latestAnalysis = await prisma.qaEvidenceAnalysis.findFirst({
    where: { programmeId, cycleId, requirementId: requirement.id },
    orderBy: { createdAt: "desc" },
    select: { state: true, explanation: true },
  });
  const evidenceGapState = latestAnalysis?.state
    ? dbAnalysisState[String(latestAnalysis.state)] ?? null
    : null;

  return QaSarRequirementSourceContextSchema.parse({
    programmeId,
    cycleId,
    requirementCode,
    requirementTitle: requirement.title,
    requirementText: requirement.title,
    diagnosticPrompts: expectations.flatMap((expectation) => [
      expectation.statement,
      expectation.purpose,
    ]).filter((value, index, all) => Boolean(value) && all.indexOf(value) === index),
    evidenceGapState,
    evidenceGapExplanation: latestAnalysis?.explanation ?? null,
    sourceBlocks,
    generatedAt: new Date().toISOString(),
  });
}
