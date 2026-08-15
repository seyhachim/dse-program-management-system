import type { Prisma } from "@prisma/client";
import {
  AUN_QA_V4_ID,
  EMPTY_QA_SAR_DOCUMENT,
  QaSarDocumentSchema,
  type QaSarBlock,
  type QaSarSectionStatus,
  type QaSarSectionView,
  type SaveQaSarSectionInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

const fromDbStatus = {
  NotStarted: "notStarted",
  Drafting: "drafting",
  ReadyForReview: "readyForReview",
  UnderReview: "underReview",
  ChangesRequested: "changesRequested",
  Approved: "approved",
} as const;

export class QaSarResourceNotFoundError extends Error {}
export class QaSarScopeMismatchError extends Error {}
export class QaSarSectionLockedError extends Error {}
export class QaSarEvidenceReferenceError extends Error {}

async function resolveContext(programmeId: string, cycleId: string, requirementCode: string) {
  const cycle = await prisma.qaAssessmentCycle.findUnique({
    where: { id: cycleId },
    select: { id: true, programmeId: true, frameworkId: true },
  });
  if (!cycle) throw new QaSarResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId || cycle.frameworkId !== AUN_QA_V4_ID) {
    throw new QaSarScopeMismatchError("SAR section does not belong to this programme and AUN-QA cycle");
  }

  const requirement = await prisma.qaRequirement.findFirst({
    where: {
      code: requirementCode,
      criterion: { frameworkId: cycle.frameworkId },
    },
    select: {
      id: true,
      code: true,
      title: true,
      criterion: { select: { code: true, title: true } },
    },
  });
  if (!requirement) throw new QaSarResourceNotFoundError("AUN-QA requirement not found for this cycle");
  return { cycle, requirement };
}

function plainText(blocks: QaSarBlock[]): string {
  return blocks
    .map((block) => {
      if ("text" in block) return block.text.trim();
      if (block.type === "evidenceReference") return `[Evidence: ${block.label}]`;
      if (block.type === "pmsData") return `[PMS data: ${block.label}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

async function validateEvidenceReferences(
  programmeId: string,
  cycleId: string,
  requirementId: string,
  blocks: QaSarBlock[],
): Promise<void> {
  const evidenceIds = [
    ...new Set(
      blocks
        .filter((block): block is Extract<QaSarBlock, { type: "evidenceReference" }> => block.type === "evidenceReference")
        .map((block) => block.evidenceId),
    ),
  ];
  if (evidenceIds.length === 0) return;

  const mappings = await prisma.qaEvidenceMapping.findMany({
    where: {
      programmeId,
      cycleId,
      requirementId,
      evidenceId: { in: evidenceIds },
    },
    select: { evidenceId: true },
  });
  const allowed = new Set(mappings.map((mapping) => mapping.evidenceId));
  const invalid = evidenceIds.find((id) => !allowed.has(id));
  if (invalid) {
    throw new QaSarEvidenceReferenceError(
      "SAR content references evidence that is not mapped to this requirement",
    );
  }
}

function toView(
  row: {
    id: string;
    programmeId: string;
    cycleId: string;
    content: Prisma.JsonValue;
    plainText: string;
    status: keyof typeof fromDbStatus;
    practiceDescribed: boolean;
    resultsAnalysed: boolean;
    improvementExplained: boolean;
    updatedAt: Date;
    updatedBy: { name: string } | null;
  } | null,
  context: Awaited<ReturnType<typeof resolveContext>>,
  programmeId: string,
  cycleId: string,
): QaSarSectionView {
  return {
    id: row?.id ?? null,
    programmeId,
    cycleId,
    criterionCode: context.requirement.criterion.code,
    criterionTitle: context.requirement.criterion.title,
    requirementCode: context.requirement.code,
    requirementTitle: context.requirement.title,
    content: row ? QaSarDocumentSchema.parse(row.content) : EMPTY_QA_SAR_DOCUMENT,
    plainText: row?.plainText ?? "",
    status: row ? (fromDbStatus[row.status] as QaSarSectionStatus) : "notStarted",
    readiness: {
      practiceDescribed: row?.practiceDescribed ?? false,
      resultsAnalysed: row?.resultsAnalysed ?? false,
      improvementExplained: row?.improvementExplained ?? false,
    },
    updatedByName: row?.updatedBy?.name ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export async function isSarRequirementAssignedToUser(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
  userId: string,
): Promise<boolean> {
  return Boolean(
    await prisma.qaRequirementAssignment.findFirst({
      where: {
        programmeId,
        cycleId,
        assigneeId: userId,
        requirement: { code: requirementCode },
      },
      select: { id: true },
    }),
  );
}

export async function getQaSarSection(
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<QaSarSectionView> {
  const context = await resolveContext(programmeId, cycleId, requirementCode);
  const row = await prisma.qaSarSection.findUnique({
    where: {
      cycleId_requirementId: {
        cycleId,
        requirementId: context.requirement.id,
      },
    },
    include: { updatedBy: { select: { name: true } } },
  });
  return toView(row, context, programmeId, cycleId);
}

export async function saveQaSarSection(
  cycleId: string,
  requirementCode: string,
  input: SaveQaSarSectionInput,
  userId: string,
): Promise<QaSarSectionView> {
  const context = await resolveContext(input.programmeId, cycleId, requirementCode);
  await validateEvidenceReferences(
    input.programmeId,
    cycleId,
    context.requirement.id,
    input.content.blocks,
  );

  const existing = await prisma.qaSarSection.findUnique({
    where: {
      cycleId_requirementId: {
        cycleId,
        requirementId: context.requirement.id,
      },
    },
    select: { status: true },
  });
  if (existing && !["NotStarted", "Drafting", "ChangesRequested"].includes(existing.status)) {
    throw new QaSarSectionLockedError(
      `SAR section is locked while its status is ${fromDbStatus[existing.status]}`,
    );
  }

  const text = plainText(input.content.blocks);
  const saved = await prisma.qaSarSection.upsert({
    where: {
      cycleId_requirementId: {
        cycleId,
        requirementId: context.requirement.id,
      },
    },
    create: {
      programmeId: input.programmeId,
      cycleId,
      requirementId: context.requirement.id,
      content: input.content as Prisma.InputJsonValue,
      plainText: text,
      status: text ? "Drafting" : "NotStarted",
      practiceDescribed: input.readiness.practiceDescribed,
      resultsAnalysed: input.readiness.resultsAnalysed,
      improvementExplained: input.readiness.improvementExplained,
      updatedById: userId,
    },
    update: {
      content: input.content as Prisma.InputJsonValue,
      plainText: text,
      status: text ? "Drafting" : "NotStarted",
      practiceDescribed: input.readiness.practiceDescribed,
      resultsAnalysed: input.readiness.resultsAnalysed,
      improvementExplained: input.readiness.improvementExplained,
      updatedById: userId,
    },
    include: { updatedBy: { select: { name: true } } },
  });

  return toView(saved, context, input.programmeId, cycleId);
}
