import type { QaEvidenceItemView, UpdateQaEvidenceItemInput } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  QaEvidenceLibraryResourceNotFoundError,
  QaEvidenceLibraryScopeMismatchError,
  listQaEvidenceLibrary,
} from "./library.ts";

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

export async function updateQaEvidenceMetadata(
  evidenceId: string,
  input: UpdateQaEvidenceItemInput,
): Promise<QaEvidenceItemView> {
  const existing = await prisma.qaEvidence.findUnique({
    where: { id: evidenceId },
    select: { id: true, programmeId: true },
  });
  if (!existing) throw new QaEvidenceLibraryResourceNotFoundError("QA evidence item not found");
  if (existing.programmeId !== input.programmeId) {
    throw new QaEvidenceLibraryScopeMismatchError("Evidence item belongs to a different programme");
  }

  await prisma.qaEvidence.update({
    where: { id: evidenceId },
    data: {
      title: input.title,
      description: input.description,
      kind: toDbEvidenceKind[input.kind],
      sourceUrl: input.sourceUrl || null,
      sourceRef: input.sourceRef,
      reportingPeriod: input.reportingPeriod,
      status: toDbEvidenceStatus[input.status],
    },
  });

  const updated = (await listQaEvidenceLibrary(input.programmeId)).find((item) => item.id === evidenceId);
  if (!updated) throw new QaEvidenceLibraryResourceNotFoundError("Updated QA evidence item not found");
  return updated;
}
