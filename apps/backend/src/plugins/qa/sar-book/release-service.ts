import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  QA_SAR_BOOK_RELEASE_TEMPLATE_VERSION,
  QaSarBookDocumentSchema,
  QaSarBookReleaseViewSchema,
  type QaSarBookCriterionSnapshot,
  type QaSarBookDocument,
  type QaSarBookNarrativeSnapshot,
  type QaSarBookReleaseView,
  type QaSarBookTocEntry,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";
import { getQaSarBookEvidenceRegister } from "./evidence-register-service.ts";
import { getQaSarBookNarrativeSection } from "./narrative-service.ts";
import { getQaSarBookPart2 } from "./part2-service.ts";
import { getQaSarBookReviewReadinessWithPart3 } from "./part3-readiness-service.ts";
import { buildQaSarBookPart3Snapshot } from "./part3-snapshot-service.ts";
import { getQaSarBook } from "./service.ts";

export class QaSarBookReleaseNotReadyError extends Error {}

const PART1_KEYS = [
  "part1.executive-summary",
  "part1.self-assessment-organisation",
  "part1.programme-background",
] as const;
const PART3_NARRATIVE_KEYS = ["part3.strengths", "part3.weaknesses"] as const;
const PART4_GLOSSARY_KEY = "part4.glossary" as const;

function narrativeSnapshot(
  number: string,
  section: Awaited<ReturnType<typeof getQaSarBookNarrativeSection>>,
): QaSarBookNarrativeSnapshot {
  return {
    sectionKey: section.sectionKey,
    title: section.title,
    number,
    revisionId: section.revisionId,
    revisionNumber: section.revisionNumber,
    content: section.content,
    plainText: section.plainText,
  };
}

function tocEntry(
  id: string,
  number: string,
  title: string,
  level: 1 | 2 | 3,
  part: "part1" | "part2" | "part3" | "part4",
  requirementCode: string | null = null,
): QaSarBookTocEntry {
  return { id, number, title, level, part, requirementCode };
}

async function resolveContext(programmeId: string, cycleId: string) {
  const [programme, cycle, book] = await Promise.all([
    prisma.programme.findUnique({
      where: { id: programmeId },
      select: { id: true, code: true, name: true },
    }),
    prisma.qaAssessmentCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, programmeId: true, title: true, reportingStart: true, reportingEnd: true },
    }),
    getQaSarBook(programmeId, cycleId),
  ]);
  if (!programme || !cycle) {
    throw new QaSarResourceNotFoundError("Programme or QA assessment cycle not found");
  }
  if (cycle.programmeId !== programmeId) {
    throw new QaSarScopeMismatchError("SAR book belongs to a different programme");
  }
  return { programme, cycle, book };
}

export async function buildQaSarBookDocument(
  programmeId: string,
  cycleId: string,
  mode: "working" | "official",
): Promise<QaSarBookDocument> {
  const { programme, cycle, book } = await resolveContext(programmeId, cycleId);
  const [part2, part3, evidenceRegister, readiness] = await Promise.all([
    getQaSarBookPart2(programmeId, cycleId),
    buildQaSarBookPart3Snapshot(programmeId, cycleId),
    getQaSarBookEvidenceRegister(programmeId, cycleId, mode),
    getQaSarBookReviewReadinessWithPart3(programmeId, cycleId),
  ]);
  const narrativeKeys = [...PART1_KEYS, ...PART3_NARRATIVE_KEYS, PART4_GLOSSARY_KEY];
  const narratives = await Promise.all(
    narrativeKeys.map((sectionKey) =>
      getQaSarBookNarrativeSection(programmeId, cycleId, sectionKey),
    ),
  );

  const narrativeByKey = new Map(narratives.map((section) => [section.sectionKey, section]));
  const requiredNarrative = (sectionKey: string) => {
    const section = narrativeByKey.get(sectionKey);
    if (!section) throw new QaSarResourceNotFoundError(`SAR book section ${sectionKey} not found`);
    return section;
  };

  const part1Sections = PART1_KEYS.map((key, index) =>
    narrativeSnapshot(`1.${index + 1}`, requiredNarrative(key)),
  );
  const strengths = narrativeSnapshot("3.1", requiredNarrative("part3.strengths"));
  const weaknesses = narrativeSnapshot("3.2", requiredNarrative("part3.weaknesses"));
  const glossary = narrativeSnapshot("4.1", requiredNarrative(PART4_GLOSSARY_KEY));

  const criteria: QaSarBookCriterionSnapshot[] = part2.criteria.map((criterion, criterionIndex) => {
    const criterionNumber = `2.${criterionIndex + 1}`;
    return {
      criterionId: criterion.criterionId,
      criterionCode: criterion.criterionCode,
      criterionTitle: criterion.criterionTitle,
      number: criterionNumber,
      requirements: criterion.requirements.map((requirement, requirementIndex) => {
        const source = mode === "official"
          ? requirement.approvedSubmission
          : requirement.latestSubmission ?? requirement.currentSource;
        return {
          criterionCode: criterion.criterionCode,
          criterionTitle: criterion.criterionTitle,
          requirementId: requirement.requirementId,
          requirementCode: requirement.requirementCode,
          requirementTitle: requirement.requirementTitle,
          number: `${criterionNumber}.${requirementIndex + 1}`,
          workflowStatus: requirement.workflowStatus,
          sourceKind: source?.kind ?? null,
          submissionId: source?.submissionId ?? null,
          submissionVersion: source?.submissionVersion ?? null,
          content: source?.content ?? null,
          plainText: source?.plainText ?? "",
          evidenceIds: source?.evidenceIds ?? [],
        };
      }),
    };
  });

  const toc: QaSarBookTocEntry[] = [
    tocEntry("part1", "1", "Part 1 — Introduction", 1, "part1"),
    ...part1Sections.map((section) =>
      tocEntry(section.sectionKey, section.number, section.title, 2, "part1"),
    ),
    tocEntry("part2", "2", "Part 2 — AUN-QA Criteria", 1, "part2"),
    ...criteria.flatMap((criterion) => [
      tocEntry(
        `part2.criterion:${criterion.criterionCode}`,
        criterion.number,
        `Criterion ${criterion.criterionCode}: ${criterion.criterionTitle}`,
        2,
        "part2",
      ),
      ...criterion.requirements.map((requirement) =>
        tocEntry(
          `part2.${requirement.requirementCode}`,
          requirement.number,
          `${requirement.requirementCode} ${requirement.requirementTitle}`,
          3,
          "part2",
          requirement.requirementCode,
        ),
      ),
    ]),
    tocEntry("part3", "3", "Part 3 — Strengths and Weaknesses Analysis", 1, "part3"),
    tocEntry(strengths.sectionKey, strengths.number, strengths.title, 2, "part3"),
    tocEntry(weaknesses.sectionKey, weaknesses.number, weaknesses.title, 2, "part3"),
    tocEntry("part3.self-ratings", "3.3", "Self-Ratings", 2, "part3"),
    tocEntry("part3.improvement-plan", "3.4", "Improvement Plan", 2, "part3"),
    tocEntry("part4", "4", "Part 4 — Appendices", 1, "part4"),
    tocEntry(glossary.sectionKey, glossary.number, glossary.title, 2, "part4"),
    tocEntry("part4.evidence-register", "4.2", evidenceRegister.terminology.evidenceRegisterTitle, 2, "part4"),
    tocEntry("part4.supporting-documents", "4.3", "Supporting Documents", 2, "part4"),
  ];

  const narrativePins = [...part1Sections, strengths, weaknesses, glossary]
    .flatMap((section) =>
      section.revisionId && section.revisionNumber
        ? [{
            sectionKey: section.sectionKey,
            revisionId: section.revisionId,
            revisionNumber: section.revisionNumber,
          }]
        : [],
    )
    .sort((a, b) => a.sectionKey.localeCompare(b.sectionKey));

  const requirementPins = criteria
    .flatMap((criterion) => criterion.requirements)
    .flatMap((requirement) =>
      requirement.submissionId && requirement.submissionVersion
        ? [{
            requirementCode: requirement.requirementCode,
            submissionId: requirement.submissionId,
            submissionVersion: requirement.submissionVersion,
          }]
        : [],
    )
    .sort((a, b) => a.requirementCode.localeCompare(b.requirementCode, undefined, { numeric: true }));

  return QaSarBookDocumentSchema.parse({
    schemaVersion: QA_SAR_BOOK_RELEASE_TEMPLATE_VERSION,
    bookTemplateVersion: book.templateVersion,
    mode,
    generatedAt: new Date().toISOString(),
    release: null,
    programme,
    cycle: {
      id: cycle.id,
      title: cycle.title,
      reportingStart: cycle.reportingStart.toISOString(),
      reportingEnd: cycle.reportingEnd.toISOString(),
    },
    framework: book.framework,
    toc,
    part1: { title: "Part 1 — Introduction", sections: part1Sections },
    part2: { title: "Part 2 — AUN-QA Criteria", criteria },
    part3: {
      title: "Part 3 — Strengths and Weaknesses Analysis",
      strengths,
      weaknesses,
      snapshot: part3,
    },
    part4: {
      title: "Part 4 — Appendices",
      glossary,
      evidenceRegister,
      supportingEvidenceIds: evidenceRegister.items.map((item) => item.evidenceId),
    },
    readiness,
    sourceIndex: {
      narrativePins,
      requirementPins,
      evidenceIds: evidenceRegister.items.map((item) => item.evidenceId).sort(),
      part3CapturedAt: part3.capturedAt,
    },
  });
}

function assertFinalizable(document: QaSarBookDocument): void {
  if (!document.readiness.readyForFinalisation) {
    const first = document.readiness.blockers[0]?.message ?? "SAR book readiness preflight is not clean";
    throw new QaSarBookReleaseNotReadyError(first);
  }
  if (document.part4.evidenceRegister.issues.length > 0) {
    throw new QaSarBookReleaseNotReadyError(
      `Evidence Register has ${document.part4.evidenceRegister.issues.length} unresolved issue(s)`,
    );
  }
  const requirements = document.part2.criteria.flatMap((criterion) => criterion.requirements);
  if (
    requirements.length === 0 ||
    requirements.some(
      (requirement) =>
        requirement.sourceKind !== "approvedSubmission" ||
        !requirement.submissionId ||
        !requirement.submissionVersion,
    )
  ) {
    throw new QaSarBookReleaseNotReadyError(
      "Every Part 2 requirement must pin an approved submission before finalisation",
    );
  }
}

function releaseToView(row: {
  id: string;
  programmeId: string;
  cycleId: string;
  version: number;
  title: string;
  templateVersion: string;
  snapshot: Prisma.JsonValue;
  submissionIds: string[];
  finalizedAt: Date;
  finalizedBy: { id: string; name: string };
}): QaSarBookReleaseView {
  if (row.templateVersion !== QA_SAR_BOOK_RELEASE_TEMPLATE_VERSION) {
    throw new QaSarResourceNotFoundError("SAR book release uses a legacy document format");
  }
  return QaSarBookReleaseViewSchema.parse({
    id: row.id,
    programmeId: row.programmeId,
    cycleId: row.cycleId,
    version: row.version,
    title: row.title,
    templateVersion: row.templateVersion,
    snapshot: row.snapshot,
    submissionIds: row.submissionIds,
    finalizedAt: row.finalizedAt.toISOString(),
    finalizedBy: row.finalizedBy,
  });
}

export async function finalizeQaSarBookRelease(
  programmeId: string,
  cycleId: string,
  userId: string,
  title?: string,
): Promise<QaSarBookReleaseView> {
  const source = await buildQaSarBookDocument(programmeId, cycleId, "official");
  assertFinalizable(source);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`qa-sar-book-release:${cycleId}`})::bigint)`,
    );
    const latest = await tx.qaSarRelease.findFirst({
      where: { cycleId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    const releaseId = randomUUID();
    const finalizedAt = new Date();
    const finalizedBy = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (!finalizedBy) throw new QaSarResourceNotFoundError("Finalizing user not found");

    const snapshot = QaSarBookDocumentSchema.parse({
      ...source,
      mode: "released",
      generatedAt: finalizedAt.toISOString(),
      release: {
        id: releaseId,
        version,
        title: title?.trim() || `${source.programme.name} — ${source.cycle.title} SAR`,
        finalizedAt: finalizedAt.toISOString(),
        finalizedBy,
      },
    });

    const created = await tx.qaSarRelease.create({
      data: {
        id: releaseId,
        programmeId,
        cycleId,
        version,
        title: snapshot.release!.title,
        templateVersion: QA_SAR_BOOK_RELEASE_TEMPLATE_VERSION,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        submissionIds: snapshot.sourceIndex.requirementPins.map((pin) => pin.submissionId),
        finalizedById: userId,
        finalizedAt,
      },
      include: { finalizedBy: { select: { id: true, name: true } } },
    });
    return releaseToView(created);
  });
}

export async function listQaSarBookReleases(
  programmeId: string,
  cycleId: string,
): Promise<QaSarBookReleaseView[]> {
  await resolveContext(programmeId, cycleId);
  const rows = await prisma.qaSarRelease.findMany({
    where: { programmeId, cycleId, templateVersion: QA_SAR_BOOK_RELEASE_TEMPLATE_VERSION },
    orderBy: { version: "desc" },
    include: { finalizedBy: { select: { id: true, name: true } } },
  });
  return rows.map(releaseToView);
}

export async function getQaSarBookRelease(
  programmeId: string,
  cycleId: string,
  releaseId: string,
): Promise<QaSarBookReleaseView> {
  const row = await prisma.qaSarRelease.findUnique({
    where: { id: releaseId },
    include: { finalizedBy: { select: { id: true, name: true } } },
  });
  if (!row || row.templateVersion !== QA_SAR_BOOK_RELEASE_TEMPLATE_VERSION) {
    throw new QaSarResourceNotFoundError("Official SAR book release not found");
  }
  if (row.programmeId !== programmeId || row.cycleId !== cycleId) {
    throw new QaSarScopeMismatchError("Official SAR book release belongs to a different programme or cycle");
  }
  return releaseToView(row);
}
