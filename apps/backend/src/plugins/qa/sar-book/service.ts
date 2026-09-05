import type { Prisma } from "@prisma/client";
import {
  QA_SAR_BOOK_STATIC_PARTS,
  QA_SAR_BOOK_TEMPLATE_VERSION,
  QaSarBookViewSchema,
  type QaSarBookPart,
  type QaSarBookReleaseLineageEntry,
  type QaSarBookRequirementPin,
  type QaSarBookSection,
  type QaSarBookView,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";

type FrameworkRequirementInput = {
  id: string;
  code: string;
  title: string;
  order: number;
};

type FrameworkCriterionInput = {
  id: string;
  code: string;
  title: string;
  order: number;
  requirements: FrameworkRequirementInput[];
};

function staticSections(
  part: (typeof QA_SAR_BOOK_STATIC_PARTS)[number],
): QaSarBookSection[] {
  return part.sections.map((section, index) => ({
    id: section.key,
    key: section.key,
    title: section.title,
    order: index + 1,
    required: section.required,
    source: section.source,
    requirementId: null,
    requirementCode: null,
  }));
}

export function buildQaSarBookParts(criteriaInput: FrameworkCriterionInput[]): QaSarBookPart[] {
  const criteria = [...criteriaInput]
    .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
    .map((criterion) => ({
      id: criterion.id,
      code: criterion.code,
      title: criterion.title,
      order: criterion.order,
      sections: [...criterion.requirements]
        .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
        .map((requirement) => ({
          id: `part2.requirement:${requirement.id}`,
          key: `part2.${requirement.code}`,
          title: requirement.title,
          order: requirement.order,
          required: true,
          source: "requirementSar" as const,
          requirementId: requirement.id,
          requirementCode: requirement.code,
        })),
    }));

  const part1 = QA_SAR_BOOK_STATIC_PARTS.find((part) => part.id === "part1")!;
  const part3 = QA_SAR_BOOK_STATIC_PARTS.find((part) => part.id === "part3")!;
  const part4 = QA_SAR_BOOK_STATIC_PARTS.find((part) => part.id === "part4")!;

  return [
    {
      id: "part1",
      title: part1.title,
      order: 1,
      sections: staticSections(part1),
      criteria: [],
    },
    {
      id: "part2",
      title: "Part 2 — AUN-QA Criteria",
      order: 2,
      sections: [],
      criteria,
    },
    {
      id: "part3",
      title: part3.title,
      order: 3,
      sections: staticSections(part3),
      criteria: [],
    },
    {
      id: "part4",
      title: part4.title,
      order: 4,
      sections: staticSections(part4),
      criteria: [],
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractQaSarBookRequirementPins(snapshot: Prisma.JsonValue): QaSarBookRequirementPin[] {
  if (!isRecord(snapshot)) return [];

  if (isRecord(snapshot.sourceIndex) && Array.isArray(snapshot.sourceIndex.requirementPins)) {
    return snapshot.sourceIndex.requirementPins
      .flatMap((pin): QaSarBookRequirementPin[] => {
        if (!isRecord(pin)) return [];
        const requirementCode = pin.requirementCode;
        const submissionId = pin.submissionId;
        const submissionVersion = pin.submissionVersion;
        if (
          typeof requirementCode === "string" && requirementCode.trim() &&
          typeof submissionId === "string" && submissionId.trim() &&
          typeof submissionVersion === "number" && Number.isInteger(submissionVersion) && submissionVersion > 0
        ) {
          return [{ requirementCode, submissionId, submissionVersion }];
        }
        return [];
      })
      .sort((a, b) => a.requirementCode.localeCompare(b.requirementCode, undefined, { numeric: true }));
  }

  if (!Array.isArray(snapshot.criteria)) return [];
  const pins: QaSarBookRequirementPin[] = [];
  for (const criterion of snapshot.criteria) {
    if (!isRecord(criterion) || !Array.isArray(criterion.sections)) continue;
    for (const section of criterion.sections) {
      if (!isRecord(section)) continue;
      const requirementCode = section.requirementCode;
      const submissionId = section.submissionId;
      const submissionVersion = section.submissionVersion;
      if (
        typeof requirementCode === "string" &&
        requirementCode.trim() &&
        typeof submissionId === "string" &&
        submissionId.trim() &&
        typeof submissionVersion === "number" &&
        Number.isInteger(submissionVersion) &&
        submissionVersion > 0
      ) {
        pins.push({ requirementCode, submissionId, submissionVersion });
      }
    }
  }

  return pins.sort((a, b) => a.requirementCode.localeCompare(b.requirementCode, undefined, { numeric: true }));
}

async function resolveBookContext(programmeId: string, cycleId: string) {
  const [programme, cycle] = await Promise.all([
    prisma.programme.findUnique({
      where: { id: programmeId },
      select: { id: true },
    }),
    prisma.qaAssessmentCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        programmeId: true,
        title: true,
        framework: {
          select: {
            id: true,
            code: true,
            name: true,
            version: true,
            criteria: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                code: true,
                title: true,
                order: true,
                requirements: {
                  orderBy: { order: "asc" },
                  select: { id: true, code: true, title: true, order: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  if (!programme || !cycle) {
    throw new QaSarResourceNotFoundError("Programme or QA assessment cycle not found");
  }
  if (cycle.programmeId !== programmeId) {
    throw new QaSarScopeMismatchError("SAR book belongs to a different programme");
  }

  return cycle;
}

async function buildReleaseLineage(
  programmeId: string,
  cycleId: string,
): Promise<QaSarBookReleaseLineageEntry[]> {
  const releases = await prisma.qaSarRelease.findMany({
    where: { programmeId, cycleId },
    orderBy: { version: "asc" },
    select: {
      id: true,
      version: true,
      title: true,
      templateVersion: true,
      finalizedAt: true,
      submissionIds: true,
      snapshot: true,
    },
  });

  return releases.map((release) => ({
    releaseId: release.id,
    releaseVersion: release.version,
    title: release.title,
    templateVersion: release.templateVersion,
    finalizedAt: release.finalizedAt.toISOString(),
    sourceSubmissionIds: release.submissionIds,
    requirementPins: extractQaSarBookRequirementPins(release.snapshot),
  }));
}

export async function getQaSarBook(
  programmeId: string,
  cycleId: string,
): Promise<QaSarBookView> {
  const cycle = await resolveBookContext(programmeId, cycleId);
  const parts = buildQaSarBookParts(cycle.framework.criteria);
  const requirementCount = parts[1]?.criteria.reduce((sum, criterion) => sum + criterion.sections.length, 0) ?? 0;
  const staticSectionCount = parts
    .filter((part) => part.id !== "part2")
    .reduce((sum, part) => sum + part.sections.length, 0);

  return QaSarBookViewSchema.parse({
    bookId: `qa-sar-book:${cycle.id}`,
    templateVersion: QA_SAR_BOOK_TEMPLATE_VERSION,
    programmeId,
    cycleId: cycle.id,
    cycleTitle: cycle.title,
    framework: {
      id: cycle.framework.id,
      code: cycle.framework.code,
      name: cycle.framework.name,
      version: cycle.framework.version,
    },
    parts,
    totals: {
      parts: 4,
      criteria: cycle.framework.criteria.length,
      requirements: requirementCount,
      staticSections: staticSectionCount,
    },
    lineage: await buildReleaseLineage(programmeId, cycleId),
  });
}