import {
  AUN_QA_V4_ID,
  type CreateQaEvidenceItemInput,
  type MapQaEvidenceInput,
  type QaEvidenceItemView,
  type QaEvidenceMappingView,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

const evidenceKind = {
  SystemLink: "systemLink",
  ExternalLink: "externalLink",
  Document: "document",
} as const;

const evidenceStatus = {
  Draft: "draft",
  Ready: "ready",
  Reviewed: "reviewed",
} as const;

const toDbEvidenceKind = {
  systemLink: "SystemLink",
  externalLink: "ExternalLink",
  document: "Document",
} as const;

const toDbEvidenceStatus = {
  draft: "Draft",
  ready: "Ready",
  reviewed: "Reviewed",
} as const;

export class QaEvidenceLibraryResourceNotFoundError extends Error {}
export class QaEvidenceLibraryScopeMismatchError extends Error {}

function mappingToView(mapping: {
  id: string;
  cycleId: string;
  expectationId: string | null;
  relevanceNote: string;
  createdAt: Date;
  requirement: { code: string };
  mappedBy: { name: string } | null;
}): QaEvidenceMappingView {
  return {
    id: mapping.id,
    cycleId: mapping.cycleId,
    requirementCode: mapping.requirement.code,
    expectationId: mapping.expectationId,
    relevanceNote: mapping.relevanceNote,
    mappedByName: mapping.mappedBy?.name ?? null,
    createdAt: mapping.createdAt.toISOString(),
  };
}

function evidenceToView(evidence: {
  id: string;
  programmeId: string;
  title: string;
  description: string;
  kind: keyof typeof evidenceKind;
  sourceUrl: string | null;
  sourceRef: string;
  reportingPeriod: string;
  status: keyof typeof evidenceStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { name: string } | null;
  mappings: Array<Parameters<typeof mappingToView>[0]>;
}): QaEvidenceItemView {
  return {
    id: evidence.id,
    programmeId: evidence.programmeId,
    title: evidence.title,
    description: evidence.description,
    kind: evidenceKind[evidence.kind],
    sourceUrl: evidence.sourceUrl,
    sourceRef: evidence.sourceRef,
    reportingPeriod: evidence.reportingPeriod,
    status: evidenceStatus[evidence.status],
    createdByName: evidence.createdBy?.name ?? null,
    createdAt: evidence.createdAt.toISOString(),
    updatedAt: evidence.updatedAt.toISOString(),
    mappings: evidence.mappings.map(mappingToView),
  };
}

const libraryInclude = {
  createdBy: { select: { name: true } },
  mappings: {
    orderBy: { createdAt: "asc" as const },
    include: {
      requirement: { select: { code: true } },
      mappedBy: { select: { name: true } },
    },
  },
} as const;

async function resolveCycle(programmeId: string, cycleId: string) {
  const cycle = await prisma.qaAssessmentCycle.findUnique({
    where: { id: cycleId },
    select: { id: true, programmeId: true, frameworkId: true },
  });
  if (!cycle) throw new QaEvidenceLibraryResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId || cycle.frameworkId !== AUN_QA_V4_ID) {
    throw new QaEvidenceLibraryScopeMismatchError(
      "Evidence mapping does not belong to this programme and AUN-QA cycle",
    );
  }
  return cycle;
}

async function resolveEvidence(programmeId: string, evidenceId: string) {
  const evidence = await prisma.qaEvidence.findUnique({
    where: { id: evidenceId },
    select: { id: true, programmeId: true },
  });
  if (!evidence) throw new QaEvidenceLibraryResourceNotFoundError("QA evidence item not found");
  if (evidence.programmeId !== programmeId) {
    throw new QaEvidenceLibraryScopeMismatchError(
      "Evidence item belongs to a different programme",
    );
  }
  return evidence;
}

async function resolveRequirementAndExpectation(
  requirementCode: string,
  expectationId: string | null | undefined,
) {
  const requirement = await prisma.qaRequirement.findFirst({
    where: {
      code: requirementCode,
      criterion: { frameworkId: AUN_QA_V4_ID },
    },
    select: { id: true, code: true },
  });
  if (!requirement) {
    throw new QaEvidenceLibraryResourceNotFoundError("AUN-QA requirement not found");
  }

  if (expectationId) {
    const expectation = await prisma.qaQualityExpectation.findUnique({
      where: { id: expectationId },
      select: { id: true, requirementId: true, active: true },
    });
    if (!expectation) {
      throw new QaEvidenceLibraryResourceNotFoundError("Quality expectation not found");
    }
    if (!expectation.active || expectation.requirementId !== requirement.id) {
      throw new QaEvidenceLibraryScopeMismatchError(
        "Quality expectation does not belong to the mapped requirement",
      );
    }
  }

  return requirement;
}

export async function listQaEvidenceLibrary(
  programmeId: string,
): Promise<QaEvidenceItemView[]> {
  const rows = await prisma.qaEvidence.findMany({
    where: { programmeId },
    orderBy: { createdAt: "desc" },
    include: libraryInclude,
  });
  return rows.map(evidenceToView);
}

export async function createQaEvidenceItem(
  input: CreateQaEvidenceItemInput,
  userId: string,
): Promise<QaEvidenceItemView> {
  const programme = await prisma.programme.findUnique({
    where: { id: input.programmeId },
    select: { id: true },
  });
  if (!programme) throw new QaEvidenceLibraryResourceNotFoundError("Programme not found");

  const created = await prisma.qaEvidence.create({
    data: {
      programmeId: input.programmeId,
      title: input.title,
      description: input.description,
      kind: toDbEvidenceKind[input.kind],
      sourceUrl: input.sourceUrl || null,
      sourceRef: input.sourceRef,
      reportingPeriod: input.reportingPeriod,
      status: toDbEvidenceStatus[input.status],
      createdById: userId,
    },
    include: libraryInclude,
  });
  return evidenceToView(created);
}

export async function mapQaEvidence(
  cycleId: string,
  evidenceId: string,
  input: MapQaEvidenceInput,
  userId: string,
): Promise<QaEvidenceItemView> {
  await Promise.all([
    resolveCycle(input.programmeId, cycleId),
    resolveEvidence(input.programmeId, evidenceId),
  ]);
  const requirement = await resolveRequirementAndExpectation(
    input.requirementCode,
    input.expectationId,
  );

  await prisma.qaEvidenceMapping.upsert({
    where: {
      cycleId_evidenceId_requirementId: {
        cycleId,
        evidenceId,
        requirementId: requirement.id,
      },
    },
    update: {
      programmeId: input.programmeId,
      expectationId: input.expectationId ?? null,
      relevanceNote: input.relevanceNote,
      mappedById: userId,
    },
    create: {
      programmeId: input.programmeId,
      cycleId,
      evidenceId,
      requirementId: requirement.id,
      expectationId: input.expectationId ?? null,
      relevanceNote: input.relevanceNote,
      mappedById: userId,
    },
  });

  const evidence = await prisma.qaEvidence.findUnique({
    where: { id: evidenceId },
    include: libraryInclude,
  });
  if (!evidence) throw new QaEvidenceLibraryResourceNotFoundError("QA evidence item not found");
  return evidenceToView(evidence);
}

export async function unmapQaEvidence(
  programmeId: string,
  cycleId: string,
  evidenceId: string,
  requirementCode: string,
): Promise<void> {
  await Promise.all([
    resolveCycle(programmeId, cycleId),
    resolveEvidence(programmeId, evidenceId),
  ]);
  const requirement = await resolveRequirementAndExpectation(requirementCode, null);
  await prisma.qaEvidenceMapping.deleteMany({
    where: {
      programmeId,
      cycleId,
      evidenceId,
      requirementId: requirement.id,
    },
  });
}
