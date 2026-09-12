import type { Prisma } from "@prisma/client";
import type {
  QaSarDocumentCriterionView,
  QaSarDocumentMode,
  QaSarDocumentModelView,
  QaSarDocumentSectionView,
  QaSarEvidenceRegisterItemView,
  QaSarReleaseView,
} from "@dse-pms/shared-types";
import { QaSarDocumentSchema } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { prepareQaSarExternalEvidence } from "../evidence-sharing/sar-integration.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";

const LEGACY_QA_SAR_TEMPLATE_VERSION = "aun-qa-sar-v1" as const;

const sectionStatus = {
  NotStarted: "missing",
  Drafting: "draft",
  ReadyForReview: "draft",
  UnderReview: "underReview",
  ChangesRequested: "changesRequested",
  Approved: "approved",
} as const;

export class QaSarFinalizeError extends Error {}

async function resolveCycle(programmeId: string, cycleId: string) {
  const [programme, cycle] = await Promise.all([
    prisma.programme.findUnique({
      where: { id: programmeId },
      select: { id: true, code: true, name: true },
    }),
    prisma.qaAssessmentCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        programmeId: true,
        frameworkId: true,
        title: true,
        reportingStart: true,
        reportingEnd: true,
      },
    }),
  ]);
  if (!programme || !cycle) throw new QaSarResourceNotFoundError("Programme or QA assessment cycle not found");
  if (cycle.programmeId !== programmeId) {
    throw new QaSarScopeMismatchError("SAR document belongs to a different programme");
  }
  return { programme, cycle };
}

function currentSectionView(
  requirement: { code: string; title: string },
  section: {
    content: Prisma.JsonValue;
    plainText: string;
    status: keyof typeof sectionStatus;
  } | null,
): QaSarDocumentSectionView {
  if (!section) {
    return {
      requirementCode: requirement.code,
      requirementTitle: requirement.title,
      status: "missing",
      submissionId: null,
      submissionVersion: null,
      content: null,
      plainText: "",
      evidenceIds: [],
    };
  }
  const content = QaSarDocumentSchema.parse(section.content);
  return {
    requirementCode: requirement.code,
    requirementTitle: requirement.title,
    status: sectionStatus[section.status],
    submissionId: null,
    submissionVersion: null,
    content,
    plainText: section.plainText,
    evidenceIds: [
      ...new Set(
        content.blocks
          .filter((block) => block.type === "evidenceReference")
          .map((block) => block.evidenceId),
      ),
    ],
  };
}

function approvedSubmissionView(
  requirement: { code: string; title: string },
  submission: {
    id: string;
    version: number;
    content: Prisma.JsonValue;
    plainText: string;
    evidenceIds: string[];
  } | null,
): QaSarDocumentSectionView {
  if (!submission) {
    return {
      requirementCode: requirement.code,
      requirementTitle: requirement.title,
      status: "missing",
      submissionId: null,
      submissionVersion: null,
      content: null,
      plainText: "",
      evidenceIds: [],
    };
  }
  return {
    requirementCode: requirement.code,
    requirementTitle: requirement.title,
    status: "approved",
    submissionId: submission.id,
    submissionVersion: submission.version,
    content: QaSarDocumentSchema.parse(submission.content),
    plainText: submission.plainText,
    evidenceIds: submission.evidenceIds,
  };
}

async function buildEvidenceRegister(
  programmeId: string,
  sections: Array<{ requirementCode: string; evidenceIds: string[] }>,
): Promise<QaSarEvidenceRegisterItemView[]> {
  const requirementCodesByEvidence = new Map<string, Set<string>>();
  for (const section of sections) {
    for (const evidenceId of section.evidenceIds) {
      const codes = requirementCodesByEvidence.get(evidenceId) ?? new Set<string>();
      codes.add(section.requirementCode);
      requirementCodesByEvidence.set(evidenceId, codes);
    }
  }
  const evidenceIds = [...requirementCodesByEvidence.keys()];
  if (evidenceIds.length === 0) return [];

  const rows = await prisma.qaEvidence.findMany({
    where: { programmeId, id: { in: evidenceIds } },
    orderBy: [{ reportingPeriod: "asc" }, { title: "asc" }],
  });
  const kind = {
    SystemLink: "systemLink",
    ExternalLink: "externalLink",
    Document: "document",
  } as const;

  return rows.map((row) => ({
    evidenceId: row.id,
    title: row.title,
    kind: kind[row.kind],
    reportingPeriod: row.reportingPeriod,
    sourceRef: row.sourceRef,
    sourceUrl: row.sourceUrl,
    requirementCodes: [...(requirementCodesByEvidence.get(row.id) ?? new Set())].sort(),
  }));
}

export async function buildQaSarDocument(
  programmeId: string,
  cycleId: string,
  mode: QaSarDocumentMode,
): Promise<QaSarDocumentModelView> {
  const { programme, cycle } = await resolveCycle(programmeId, cycleId);
  const criteria = await prisma.qaCriterion.findMany({
    where: { frameworkId: cycle.frameworkId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      code: true,
      title: true,
      requirements: {
        orderBy: { order: "asc" },
        select: { id: true, code: true, title: true },
      },
    },
  });

  const requirementIds = criteria.flatMap((criterion) => criterion.requirements.map((requirement) => requirement.id));
  const sectionByRequirement = new Map<string, {
    content: Prisma.JsonValue;
    plainText: string;
    status: keyof typeof sectionStatus;
  }>();
  const approvedByRequirement = new Map<string, {
    id: string;
    version: number;
    content: Prisma.JsonValue;
    plainText: string;
    evidenceIds: string[];
  }>();

  if (mode === "working") {
    const sections = await prisma.qaSarSection.findMany({
      where: { programmeId, cycleId, requirementId: { in: requirementIds } },
      select: { requirementId: true, content: true, plainText: true, status: true },
    });
    for (const section of sections) sectionByRequirement.set(section.requirementId, section);
  } else {
    const submissions = await prisma.qaSarSubmission.findMany({
      where: {
        programmeId,
        cycleId,
        requirementId: { in: requirementIds },
        reviews: { some: { decision: "Approved" } },
      },
      orderBy: [{ requirementId: "asc" }, { version: "desc" }],
      select: {
        id: true,
        requirementId: true,
        version: true,
        content: true,
        plainText: true,
        evidenceIds: true,
      },
    });
    for (const submission of submissions) {
      if (!approvedByRequirement.has(submission.requirementId)) {
        approvedByRequirement.set(submission.requirementId, submission);
      }
    }
  }

  const criterionViews: QaSarDocumentCriterionView[] = criteria.map((criterion) => ({
    code: criterion.code,
    title: criterion.title,
    sections: criterion.requirements.map((requirement) =>
      mode === "working"
        ? currentSectionView(requirement, sectionByRequirement.get(requirement.id) ?? null)
        : approvedSubmissionView(requirement, approvedByRequirement.get(requirement.id) ?? null),
    ),
  }));
  const allSections = criterionViews.flatMap((criterion) => criterion.sections);
  const evidenceRegister = await buildEvidenceRegister(
    programmeId,
    allSections.map((section) => ({ requirementCode: section.requirementCode, evidenceIds: section.evidenceIds })),
  );
  const approvedSections = allSections.filter((section) => section.status === "approved").length;
  const includedSections = allSections.filter((section) => section.content !== null).length;

  return {
    programmeId,
    programmeCode: programme.code,
    programmeName: programme.name,
    cycleId,
    cycleTitle: cycle.title,
    reportingStart: cycle.reportingStart.toISOString(),
    reportingEnd: cycle.reportingEnd.toISOString(),
    mode,
    generatedAt: new Date().toISOString(),
    totals: {
      requiredSections: allSections.length,
      includedSections,
      approvedSections,
      missingSections: allSections.length - includedSections,
    },
    criteria: criterionViews,
    evidenceRegister,
  };
}

async function validateOfficialEvidenceMappings(model: QaSarDocumentModelView): Promise<void> {
  for (const criterion of model.criteria) {
    for (const section of criterion.sections) {
      if (!section.submissionId || section.evidenceIds.length === 0) continue;
      const requirement = await prisma.qaRequirement.findFirst({
        where: {
          code: section.requirementCode,
          criterion: { frameworkId: (await prisma.qaAssessmentCycle.findUniqueOrThrow({ where: { id: model.cycleId }, select: { frameworkId: true } })).frameworkId },
        },
        select: { id: true },
      });
      if (!requirement) throw new QaSarFinalizeError(`Requirement ${section.requirementCode} no longer exists`);
      const mappings = await prisma.qaEvidenceMapping.findMany({
        where: {
          programmeId: model.programmeId,
          cycleId: model.cycleId,
          requirementId: requirement.id,
          evidenceId: { in: section.evidenceIds },
        },
        select: { evidenceId: true },
      });
      const mapped = new Set(mappings.map((row) => row.evidenceId));
      const missing = section.evidenceIds.find((id) => !mapped.has(id));
      if (missing) {
        throw new QaSarFinalizeError(
          `Approved section ${section.requirementCode} references evidence that is no longer mapped to it`,
        );
      }
    }
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
}): QaSarReleaseView {
  return {
    id: row.id,
    programmeId: row.programmeId,
    cycleId: row.cycleId,
    version: row.version,
    title: row.title,
    templateVersion: row.templateVersion,
    snapshot: row.snapshot as unknown as QaSarDocumentModelView,
    submissionIds: row.submissionIds,
    finalizedBy: row.finalizedBy,
    finalizedAt: row.finalizedAt.toISOString(),
  };
}

export async function finalizeQaSarDocument(
  programmeId: string,
  cycleId: string,
  userId: string,
  title?: string,
): Promise<QaSarReleaseView> {
  let model = await buildQaSarDocument(programmeId, cycleId, "official");
  if (model.totals.requiredSections === 0 || model.totals.missingSections > 0) {
    throw new QaSarFinalizeError(
      `Official SAR cannot be finalized: ${model.totals.missingSections} required section(s) do not have an approved submission`,
    );
  }
  await validateOfficialEvidenceMappings(model);
  const submissionIds = model.criteria.flatMap((criterion) =>
    criterion.sections.map((section) => section.submissionId).filter((id): id is string => Boolean(id)),
  );
  if (submissionIds.length !== model.totals.requiredSections) {
    throw new QaSarFinalizeError("Official SAR submission manifest is incomplete");
  }

  // Freeze the exact evidence content used in this release and embed fresh,
  // unlisted assessor URLs into the immutable release snapshot. No live source
  // route is used as the release-time evidence source of truth.
  model = await prepareQaSarExternalEvidence(model, userId);

  const latest = await prisma.qaSarRelease.findFirst({
    where: { cycleId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const created = await prisma.qaSarRelease.create({
    data: {
      programmeId,
      cycleId,
      version: (latest?.version ?? 0) + 1,
      title: title?.trim() || `${model.programmeName} — ${model.cycleTitle} SAR`,
      templateVersion: LEGACY_QA_SAR_TEMPLATE_VERSION,
      snapshot: model as unknown as Prisma.InputJsonValue,
      submissionIds,
      finalizedById: userId,
    },
    include: { finalizedBy: { select: { id: true, name: true } } },
  });
  return releaseToView(created);
}

export async function listQaSarReleases(programmeId: string, cycleId: string): Promise<QaSarReleaseView[]> {
  await resolveCycle(programmeId, cycleId);
  const rows = await prisma.qaSarRelease.findMany({
    where: { programmeId, cycleId, templateVersion: LEGACY_QA_SAR_TEMPLATE_VERSION },
    orderBy: { version: "desc" },
    include: { finalizedBy: { select: { id: true, name: true } } },
  });
  return rows.map(releaseToView);
}

export async function getQaSarRelease(programmeId: string, releaseId: string): Promise<QaSarReleaseView> {
  const row = await prisma.qaSarRelease.findUnique({
    where: { id: releaseId },
    include: { finalizedBy: { select: { id: true, name: true } } },
  });
  if (!row || row.templateVersion !== LEGACY_QA_SAR_TEMPLATE_VERSION) {
    throw new QaSarResourceNotFoundError("Official SAR release not found");
  }
  if (row.programmeId !== programmeId) {
    throw new QaSarScopeMismatchError("Official SAR release belongs to a different programme");
  }
  return releaseToView(row);
}