import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  DEFAULT_QA_SAR_BOOK_TERMINOLOGY,
  QaSarBookEvidenceRegisterViewSchema,
  QaSarBookSectionEvidenceReferenceViewSchema,
  QaSarBookTerminologySchema,
  findQaSarBookStaticSection,
  type AddQaSarBookSectionEvidenceReferenceInput,
  type QaSarBookAppendixGroup,
  type QaSarBookEvidenceRegisterItem,
  type QaSarBookEvidenceRegisterView,
  type QaSarBookEvidenceUsage,
  type QaSarBookSectionEvidenceReferenceView,
  type QaSarBookTerminology,
  type UpdateQaSarBookEvidencePresentationInput,
  type UpdateQaSarBookTerminologyInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";
import { getQaSarBookPart2 } from "./part2-service.ts";

export type QaSarBookEvidenceMode = "working" | "official";

export class QaSarBookEvidenceReferenceConflictError extends Error {}

interface TerminologyRow {
  evidenceCitationLabel: string;
  evidenceRegisterTitle: string;
  appendixLabel: string;
  requirementLabel: string;
  criterionLabel: string;
}

interface StaticReferenceRow {
  id: string;
  programmeId: string;
  cycleId: string;
  sectionKey: string;
  revisionId: string;
  evidenceId: string;
  createdById: string | null;
  createdAt: Date;
  evidenceTitle: string;
}

interface PresentationRow {
  evidenceId: string;
  appendixGroup: QaSarBookAppendixGroup;
}

async function assertCycleScope(programmeId: string, cycleId: string): Promise<void> {
  const cycle = await prisma.qaAssessmentCycle.findUnique({
    where: { id: cycleId },
    select: { programmeId: true },
  });
  if (!cycle) throw new QaSarResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId) {
    throw new QaSarScopeMismatchError("SAR book evidence belongs to a different programme");
  }
}

function dbKindToView(kind: "SystemLink" | "ExternalLink" | "Document") {
  return kind === "SystemLink" ? "systemLink" : kind === "ExternalLink" ? "externalLink" : "document";
}

function dbStatusToView(status: "Draft" | "Ready" | "Reviewed") {
  return status === "Draft" ? "draft" : status === "Ready" ? "ready" : "reviewed";
}

function staticPart(sectionKey: string): "part1" | "part3" | "part4" {
  if (sectionKey.startsWith("part1.")) return "part1";
  if (sectionKey.startsWith("part3.")) return "part3";
  return "part4";
}

function usageSortKey(usage: QaSarBookEvidenceUsage): string {
  const partOrder = usage.part === "part1" ? "1" : usage.part === "part2" ? "2" : usage.part === "part3" ? "3" : "4";
  return `${partOrder}:${usage.requirementCode ?? ""}:${usage.sectionKey}`;
}

function numberBase(usage: QaSarBookEvidenceUsage): string {
  if (usage.requirementCode) return usage.requirementCode;
  return usage.part === "part1" ? "P1" : usage.part === "part3" ? "P3" : "P4";
}

export function assignDeterministicExhibitNumbers(
  rows: Array<Omit<QaSarBookEvidenceRegisterItem, "number" | "citationLabel" | "citationText">>,
  citationLabel: string,
): QaSarBookEvidenceRegisterItem[] {
  const sorted = [...rows].sort((a, b) => {
    const aUsage = [...a.usages].sort((x, y) => usageSortKey(x).localeCompare(usageSortKey(y)))[0]!;
    const bUsage = [...b.usages].sort((x, y) => usageSortKey(x).localeCompare(usageSortKey(y)))[0]!;
    return usageSortKey(aUsage).localeCompare(usageSortKey(bUsage)) || a.evidenceId.localeCompare(b.evidenceId);
  });
  const counters = new Map<string, number>();
  return sorted.map((row) => {
    const usages = [...row.usages].sort((a, b) => usageSortKey(a).localeCompare(usageSortKey(b)));
    const base = numberBase(usages[0]!);
    const next = (counters.get(base) ?? 0) + 1;
    counters.set(base, next);
    const number = `${base}-${String(next).padStart(2, "0")}`;
    return {
      ...row,
      usages,
      number,
      citationLabel,
      citationText: `${citationLabel} ${number}`,
    };
  });
}

export async function getQaSarBookTerminology(programmeId: string): Promise<QaSarBookTerminology> {
  const programme = await prisma.programme.findUnique({ where: { id: programmeId }, select: { id: true } });
  if (!programme) throw new QaSarResourceNotFoundError("Programme not found");
  const rows = await prisma.$queryRaw<TerminologyRow[]>(Prisma.sql`
    SELECT "evidenceCitationLabel", "evidenceRegisterTitle", "appendixLabel", "requirementLabel", "criterionLabel"
    FROM "QaSarBookTerminology"
    WHERE "programmeId" = ${programmeId}
    LIMIT 1
  `);
  return QaSarBookTerminologySchema.parse(rows[0] ?? DEFAULT_QA_SAR_BOOK_TERMINOLOGY);
}

export async function updateQaSarBookTerminology(
  input: UpdateQaSarBookTerminologyInput,
  userId: string,
): Promise<QaSarBookTerminology> {
  const terminology = QaSarBookTerminologySchema.parse(input.terminology);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "QaSarBookTerminology" (
      "programmeId", "evidenceCitationLabel", "evidenceRegisterTitle", "appendixLabel",
      "requirementLabel", "criterionLabel", "updatedById", "createdAt", "updatedAt"
    ) VALUES (
      ${input.programmeId}, ${terminology.evidenceCitationLabel}, ${terminology.evidenceRegisterTitle},
      ${terminology.appendixLabel}, ${terminology.requirementLabel}, ${terminology.criterionLabel},
      ${userId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("programmeId") DO UPDATE SET
      "evidenceCitationLabel" = EXCLUDED."evidenceCitationLabel",
      "evidenceRegisterTitle" = EXCLUDED."evidenceRegisterTitle",
      "appendixLabel" = EXCLUDED."appendixLabel",
      "requirementLabel" = EXCLUDED."requirementLabel",
      "criterionLabel" = EXCLUDED."criterionLabel",
      "updatedById" = EXCLUDED."updatedById",
      "updatedAt" = CURRENT_TIMESTAMP
  `);
  return getQaSarBookTerminology(input.programmeId);
}

async function latestStaticReferenceRows(programmeId: string, cycleId: string): Promise<StaticReferenceRow[]> {
  return prisma.$queryRaw<StaticReferenceRow[]>(Prisma.sql`
    SELECT ref."id", ref."programmeId", ref."cycleId", ref."sectionKey", ref."revisionId",
           ref."evidenceId", ref."createdById", ref."createdAt", evidence."title" AS "evidenceTitle"
    FROM "QaSarBookSectionEvidenceReference" ref
    JOIN "QaSarBookSectionRevision" revision ON revision."id" = ref."revisionId"
    JOIN "QaEvidence" evidence ON evidence."id" = ref."evidenceId"
    WHERE ref."programmeId" = ${programmeId}
      AND ref."cycleId" = ${cycleId}
      AND NOT EXISTS (
        SELECT 1 FROM "QaSarBookSectionRevision" newer
        WHERE newer."programmeId" = revision."programmeId"
          AND newer."cycleId" = revision."cycleId"
          AND newer."sectionKey" = revision."sectionKey"
          AND newer."revisionNumber" > revision."revisionNumber"
      )
    ORDER BY ref."sectionKey", ref."createdAt", ref."id"
  `);
}

async function presentationMap(programmeId: string, cycleId: string): Promise<Map<string, QaSarBookAppendixGroup>> {
  const rows = await prisma.$queryRaw<PresentationRow[]>(Prisma.sql`
    SELECT "evidenceId", "appendixGroup"
    FROM "QaSarBookEvidencePresentation"
    WHERE "programmeId" = ${programmeId} AND "cycleId" = ${cycleId}
  `);
  return new Map(rows.map((row) => [row.evidenceId, row.appendixGroup]));
}

export async function getQaSarBookEvidenceRegister(
  programmeId: string,
  cycleId: string,
  mode: QaSarBookEvidenceMode = "working",
): Promise<QaSarBookEvidenceRegisterView> {
  await assertCycleScope(programmeId, cycleId);
  const [part2, staticRefs, terminology, presentations] = await Promise.all([
    getQaSarBookPart2(programmeId, cycleId),
    latestStaticReferenceRows(programmeId, cycleId),
    getQaSarBookTerminology(programmeId),
    presentationMap(programmeId, cycleId),
  ]);

  const usagesByEvidence = new Map<string, QaSarBookEvidenceUsage[]>();
  const issues: QaSarBookEvidenceRegisterView["issues"] = [];

  for (const criterion of part2.criteria) {
    for (const requirement of criterion.requirements) {
      const source = mode === "official"
        ? requirement.approvedSubmission
        : requirement.latestSubmission ?? requirement.currentSource;
      if (!source) continue;
      for (const evidenceId of source.evidenceIds) {
        const usages = usagesByEvidence.get(evidenceId) ?? [];
        usages.push({
          part: "part2",
          sectionKey: `part2.${requirement.requirementCode}`,
          sectionTitle: requirement.requirementTitle,
          requirementCode: requirement.requirementCode,
          submissionId: source.submissionId,
          revisionId: null,
        });
        usagesByEvidence.set(evidenceId, usages);
      }
      for (const evidenceId of requirement.brokenEvidenceReferenceIds) {
        if (source.evidenceIds.includes(evidenceId)) {
          issues.push({
            type: "invalidReference",
            evidenceId,
            sectionKey: `part2.${requirement.requirementCode}`,
            requirementCode: requirement.requirementCode,
            message: `Evidence ${evidenceId} is cited by ${requirement.requirementCode} but is not mapped to that requirement.`,
          });
        }
      }
    }
  }

  for (const ref of staticRefs) {
    const section = findQaSarBookStaticSection(ref.sectionKey);
    if (!section) continue;
    const usages = usagesByEvidence.get(ref.evidenceId) ?? [];
    usages.push({
      part: staticPart(ref.sectionKey),
      sectionKey: ref.sectionKey,
      sectionTitle: section.title,
      requirementCode: null,
      submissionId: null,
      revisionId: ref.revisionId,
    });
    usagesByEvidence.set(ref.evidenceId, usages);
  }

  const evidenceIds = [...usagesByEvidence.keys()];
  const evidenceRows = evidenceIds.length
    ? await prisma.qaEvidence.findMany({
        where: { programmeId, id: { in: evidenceIds } },
        select: {
          id: true,
          title: true,
          kind: true,
          status: true,
          reportingPeriod: true,
          sourceRef: true,
          sourceUrl: true,
        },
      })
    : [];
  const evidenceById = new Map(evidenceRows.map((row) => [row.id, row]));

  const unnumbered: Array<Omit<QaSarBookEvidenceRegisterItem, "number" | "citationLabel" | "citationText">> = [];
  for (const [evidenceId, usages] of usagesByEvidence) {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence) {
      for (const usage of usages) {
        issues.push({
          type: "missingEvidence",
          evidenceId,
          sectionKey: usage.sectionKey,
          requirementCode: usage.requirementCode,
          message: `Referenced evidence ${evidenceId} is unavailable in this programme.`,
        });
      }
      continue;
    }
    if (evidence.status === "Draft") {
      for (const usage of usages) {
        issues.push({
          type: "draftEvidence",
          evidenceId,
          sectionKey: usage.sectionKey,
          requirementCode: usage.requirementCode,
          message: `${evidence.title} is still Draft and cannot be treated as official evidence.`,
        });
      }
    }
    unnumbered.push({
      evidenceId: evidence.id,
      title: evidence.title,
      kind: dbKindToView(evidence.kind),
      status: dbStatusToView(evidence.status),
      reportingPeriod: evidence.reportingPeriod,
      sourceRef: evidence.sourceRef,
      sourceUrl: evidence.sourceUrl?.trim() ? evidence.sourceUrl : null,
      appendixGroup: presentations.get(evidence.id) ?? "other",
      usages,
    });
  }

  const items = assignDeterministicExhibitNumbers(unnumbered, terminology.evidenceCitationLabel);
  issues.sort((a, b) => `${a.sectionKey}:${a.evidenceId}:${a.type}`.localeCompare(`${b.sectionKey}:${b.evidenceId}:${b.type}`));
  return QaSarBookEvidenceRegisterViewSchema.parse({
    programmeId,
    cycleId,
    terminology,
    items,
    issues,
    generatedAt: new Date().toISOString(),
  });
}

async function assertCurrentSectionRevision(
  programmeId: string,
  cycleId: string,
  sectionKey: string,
  revisionId: string,
): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "QaSarBookSectionRevision"
    WHERE "id" = ${revisionId}
      AND "programmeId" = ${programmeId}
      AND "cycleId" = ${cycleId}
      AND "sectionKey" = ${sectionKey}
      AND NOT EXISTS (
        SELECT 1 FROM "QaSarBookSectionRevision" newer
        WHERE newer."programmeId" = ${programmeId}
          AND newer."cycleId" = ${cycleId}
          AND newer."sectionKey" = ${sectionKey}
          AND newer."revisionNumber" > "QaSarBookSectionRevision"."revisionNumber"
      )
    LIMIT 1
  `);
  if (!rows[0]) {
    throw new QaSarBookEvidenceReferenceConflictError("Evidence can only be linked to the current SAR section revision");
  }
}

export async function listQaSarBookSectionEvidenceReferences(
  programmeId: string,
  cycleId: string,
  sectionKey: string,
): Promise<QaSarBookSectionEvidenceReferenceView[]> {
  const section = findQaSarBookStaticSection(sectionKey);
  if (!section || section.source === "generated") throw new QaSarResourceNotFoundError("SAR book section not found");
  await assertCycleScope(programmeId, cycleId);
  const rows = await latestStaticReferenceRows(programmeId, cycleId);
  return rows
    .filter((row) => row.sectionKey === sectionKey)
    .map((row) => QaSarBookSectionEvidenceReferenceViewSchema.parse({
      id: row.id,
      programmeId: row.programmeId,
      cycleId: row.cycleId,
      sectionKey: row.sectionKey,
      revisionId: row.revisionId,
      evidenceId: row.evidenceId,
      evidenceTitle: row.evidenceTitle,
      appendixGroup: "other",
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
    }));
}

export async function addQaSarBookSectionEvidenceReference(
  cycleId: string,
  sectionKey: string,
  input: AddQaSarBookSectionEvidenceReferenceInput,
  userId: string,
): Promise<QaSarBookSectionEvidenceReferenceView> {
  const section = findQaSarBookStaticSection(sectionKey);
  if (!section || section.source === "generated") throw new QaSarResourceNotFoundError("SAR book section not found");
  await assertCycleScope(input.programmeId, cycleId);
  await assertCurrentSectionRevision(input.programmeId, cycleId, sectionKey, input.revisionId);
  const evidence = await prisma.qaEvidence.findFirst({
    where: { id: input.evidenceId, programmeId: input.programmeId },
    select: { id: true, title: true },
  });
  if (!evidence) throw new QaSarResourceNotFoundError("Evidence item not found in this programme");

  const id = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "QaSarBookSectionEvidenceReference" (
        "id", "programmeId", "cycleId", "sectionKey", "revisionId", "evidenceId", "createdById", "createdAt"
      ) VALUES (${id}, ${input.programmeId}, ${cycleId}, ${sectionKey}, ${input.revisionId}, ${input.evidenceId}, ${userId}, CURRENT_TIMESTAMP)
      ON CONFLICT ("revisionId", "evidenceId") DO NOTHING
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "QaSarBookEvidencePresentation" (
        "id", "programmeId", "cycleId", "evidenceId", "appendixGroup", "updatedById", "createdAt", "updatedAt"
      ) VALUES (${randomUUID()}, ${input.programmeId}, ${cycleId}, ${input.evidenceId}, ${input.appendixGroup}, ${userId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("cycleId", "evidenceId") DO NOTHING
    `);
  });
  const refs = await listQaSarBookSectionEvidenceReferences(input.programmeId, cycleId, sectionKey);
  const saved = refs.find((row) => row.evidenceId === input.evidenceId);
  if (!saved) throw new QaSarBookEvidenceReferenceConflictError("Evidence reference was not saved");
  return { ...saved, appendixGroup: input.appendixGroup };
}

export async function deleteQaSarBookSectionEvidenceReference(
  programmeId: string,
  cycleId: string,
  referenceId: string,
): Promise<void> {
  await assertCycleScope(programmeId, cycleId);
  const changed = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "QaSarBookSectionEvidenceReference"
    WHERE "id" = ${referenceId}
      AND "programmeId" = ${programmeId}
      AND "cycleId" = ${cycleId}
  `);
  if (!changed) throw new QaSarResourceNotFoundError("SAR evidence reference not found");
}

export async function updateQaSarBookEvidencePresentation(
  cycleId: string,
  evidenceId: string,
  input: UpdateQaSarBookEvidencePresentationInput,
  userId: string,
): Promise<void> {
  await assertCycleScope(input.programmeId, cycleId);
  const evidence = await prisma.qaEvidence.findFirst({ where: { id: evidenceId, programmeId: input.programmeId }, select: { id: true } });
  if (!evidence) throw new QaSarResourceNotFoundError("Evidence item not found in this programme");
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "QaSarBookEvidencePresentation" (
      "id", "programmeId", "cycleId", "evidenceId", "appendixGroup", "updatedById", "createdAt", "updatedAt"
    ) VALUES (${randomUUID()}, ${input.programmeId}, ${cycleId}, ${evidenceId}, ${input.appendixGroup}, ${userId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("cycleId", "evidenceId") DO UPDATE SET
      "appendixGroup" = EXCLUDED."appendixGroup",
      "updatedById" = EXCLUDED."updatedById",
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "QaSarBookEvidencePresentation"."programmeId" = EXCLUDED."programmeId"
  `);
}
