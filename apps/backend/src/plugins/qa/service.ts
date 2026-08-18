import {
  AUN_QA_V4_ID,
  QA_PILOT_REQUIREMENT_CODES,
  QaApplicabilityRuleSchema,
  QaEvidenceRelationshipRequirementSchema,
  QaEvidenceScopeRequirementSchema,
  QaSourceAuthorityRequirementSchema,
  QaTemporalRuleSchema,
  type CreateQaCycleInput,
  type CreateQaEvidenceInput,
  type QaCycleView,
  type QaDashboardView,
  type QaEvidenceSourceDomain,
  type QaEvidenceView,
  type QaExpectedEvidenceRole,
  type QaKnowledgeView,
  type QaQualityExpectationView,
  type QaSelfAssessmentView,
  type UpsertQaSelfAssessmentInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { createAndMapQaEvidence, listMappedQaEvidenceForCycle } from "./evidence/library.ts";

const cycleStatus = {
  Draft: "draft",
  Active: "active",
  UnderReview: "underReview",
  Closed: "closed",
} as const;

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

function toCycleView(cycle: {
  id: string;
  programmeId: string;
  title: string;
  reportingStart: Date;
  reportingEnd: Date;
  status: keyof typeof cycleStatus;
  createdAt: Date;
}): QaCycleView {
  return {
    id: cycle.id,
    programmeId: cycle.programmeId,
    title: cycle.title,
    reportingStart: cycle.reportingStart.toISOString(),
    reportingEnd: cycle.reportingEnd.toISOString(),
    status: cycleStatus[cycle.status],
    createdAt: cycle.createdAt.toISOString(),
  };
}

function toEvidenceView(evidence: {
  id: string;
  requirement: { code: string };
  title: string;
  description: string;
  kind: keyof typeof evidenceKind;
  sourceUrl: string | null;
  sourceRef: string;
  reportingPeriod: string;
  status: keyof typeof evidenceStatus;
  createdAt: Date;
}): QaEvidenceView {
  return {
    id: evidence.id,
    requirementCode: evidence.requirement.code,
    title: evidence.title,
    description: evidence.description,
    kind: evidenceKind[evidence.kind],
    sourceUrl: evidence.sourceUrl,
    sourceRef: evidence.sourceRef,
    reportingPeriod: evidence.reportingPeriod,
    status: evidenceStatus[evidence.status],
    createdAt: evidence.createdAt.toISOString(),
  };
}

type QaKnowledgeRow = {
  frameworkId: string;
  frameworkVersion: string;
  requirementCode: string;
  expectationId: string;
  statement: string;
  purpose: string;
  expectationOrder: number;
  applicabilityRule: unknown;
  expectationScopeRequirement: unknown;
  expectationTemporalRule: unknown;
  relationshipRequirement: unknown;
  evidenceId: string | null;
  evidenceType: string | null;
  evidenceDescription: string | null;
  evidenceRole: string | null;
  sourceDomain: string | null;
  evidenceOrder: number | null;
  evidenceScopeRequirement: unknown | null;
  evidenceTemporalRule: unknown | null;
  authorityRequirement: unknown | null;
};

export class QaResourceNotFoundError extends Error {}
export class QaScopeMismatchError extends Error {}

export const qaService = {
  async getKnowledge(): Promise<QaKnowledgeView> {
    const rows = await prisma.$queryRaw<QaKnowledgeRow[]>`
      SELECT
        f.id AS "frameworkId",
        f.version AS "frameworkVersion",
        r.code AS "requirementCode",
        e.id AS "expectationId",
        e.statement,
        e.purpose,
        e."order" AS "expectationOrder",
        e."applicabilityRule",
        e."scopeRequirement" AS "expectationScopeRequirement",
        e."temporalRule" AS "expectationTemporalRule",
        e."relationshipRequirement",
        x.id AS "evidenceId",
        x."evidenceType",
        x.description AS "evidenceDescription",
        x.role AS "evidenceRole",
        x."sourceDomain",
        x."order" AS "evidenceOrder",
        x."scopeRequirement" AS "evidenceScopeRequirement",
        x."temporalRule" AS "evidenceTemporalRule",
        x."authorityRequirement"
      FROM "QaQualityExpectation" e
      JOIN "QaRequirement" r ON r.id = e."requirementId"
      JOIN "QaCriterion" c ON c.id = r."criterionId"
      JOIN "QaFramework" f ON f.id = c."frameworkId"
      LEFT JOIN "QaExpectedEvidence" x ON x."expectationId" = e.id
      WHERE f.id = ${AUN_QA_V4_ID} AND e.active = true
      ORDER BY c."order", r."order", e."order", x."order"
    `;

    if (rows.length === 0) {
      throw new QaResourceNotFoundError(
        "AUN-QA expectation knowledge is not installed. Apply database migrations.",
      );
    }

    const expectations = new Map<string, QaQualityExpectationView>();
    for (const row of rows) {
      let expectation = expectations.get(row.expectationId);
      if (!expectation) {
        expectation = {
          id: row.expectationId,
          requirementCode: row.requirementCode,
          statement: row.statement,
          purpose: row.purpose,
          order: row.expectationOrder,
          applicabilityRule: QaApplicabilityRuleSchema.parse(row.applicabilityRule),
          scopeRequirement: QaEvidenceScopeRequirementSchema.parse(row.expectationScopeRequirement),
          temporalRule: QaTemporalRuleSchema.parse(row.expectationTemporalRule),
          relationshipRequirement: QaEvidenceRelationshipRequirementSchema.parse(
            row.relationshipRequirement,
          ),
          expectedEvidence: [],
        };
        expectations.set(row.expectationId, expectation);
      }

      if (
        row.evidenceId &&
        row.evidenceType &&
        row.evidenceDescription &&
        row.evidenceRole &&
        row.sourceDomain &&
        row.evidenceOrder !== null
      ) {
        expectation.expectedEvidence.push({
          id: row.evidenceId,
          evidenceType: row.evidenceType,
          description: row.evidenceDescription,
          role: row.evidenceRole as QaExpectedEvidenceRole,
          sourceDomain: row.sourceDomain as QaEvidenceSourceDomain,
          order: row.evidenceOrder,
          scopeRequirement: QaEvidenceScopeRequirementSchema.parse(row.evidenceScopeRequirement),
          temporalRule: QaTemporalRuleSchema.parse(row.evidenceTemporalRule),
          authorityRequirement: QaSourceAuthorityRequirementSchema.parse(row.authorityRequirement),
        });
      }
    }

    return {
      frameworkId: rows[0]!.frameworkId,
      frameworkVersion: rows[0]!.frameworkVersion,
      pilotRequirementCodes: QA_PILOT_REQUIREMENT_CODES,
      expectations: [...expectations.values()],
    };
  },

  async getDashboard(
    programmeId: string,
    cycleId?: string,
  ): Promise<QaDashboardView> {
    const framework = await prisma.qaFramework.findUnique({
      where: { id: AUN_QA_V4_ID },
      include: {
        criteria: {
          orderBy: { order: "asc" },
          include: {
            requirements: { orderBy: { order: "asc" } },
          },
        },
      },
    });

    if (!framework) {
      throw new QaResourceNotFoundError(
        "AUN-QA v4 catalogue is not installed. Run the database seed.",
      );
    }

    const cycles = await prisma.qaAssessmentCycle.findMany({
      where: { programmeId, frameworkId: framework.id },
      orderBy: [{ reportingEnd: "desc" }, { createdAt: "desc" }],
    });

    const selected = cycleId
      ? cycles.find((cycle) => cycle.id === cycleId)
      : cycles.find((cycle) => cycle.status === "Active") ?? cycles[0];

    if (cycleId && !selected) {
      throw new QaResourceNotFoundError("QA assessment cycle not found");
    }

    const [evidenceRows, assessmentRows] = selected
      ? await Promise.all([
          listMappedQaEvidenceForCycle(programmeId, selected.id),
          prisma.qaRequirementAssessment.findMany({
            where: { programmeId, cycleId: selected.id },
            orderBy: { requirement: { code: "asc" } },
            include: {
              requirement: { select: { code: true } },
              reviewer: { select: { name: true } },
            },
          }),
        ])
      : [[], []];

    const evidenceCodes = new Set(evidenceRows.map((row) => row.requirementCode));
    const reviewedCodes = new Set(
      evidenceRows
        .filter((row) => row.status === "reviewed")
        .map((row) => row.requirementCode),
    );
    const ratedCodes = new Set(
      assessmentRows
        .filter((row) => row.rating !== null)
        .map((row) => row.requirement.code),
    );

    const criteria = framework.criteria.map((criterion) => {
      const requirements = criterion.requirements.map((requirement) => ({
        code: requirement.code,
        title: requirement.title,
      }));
      const codes = requirements.map((requirement) => requirement.code);
      return {
        code: criterion.code,
        title: criterion.title,
        summary: criterion.summary,
        requirements,
        total: requirements.length,
        evidenceCovered: codes.filter((code) => evidenceCodes.has(code)).length,
        rated: codes.filter((code) => ratedCodes.has(code)).length,
        reviewedEvidence: codes.filter((code) => reviewedCodes.has(code)).length,
      };
    });

    const selfAssessments: QaSelfAssessmentView[] = assessmentRows.map((row) => ({
      requirementCode: row.requirement.code,
      rating: row.rating,
      narrative: row.narrative,
      reviewerName: row.reviewer?.name ?? "Unknown reviewer",
      updatedAt: row.updatedAt.toISOString(),
    }));

    return {
      programmeId,
      framework: {
        id: framework.id,
        name: framework.name,
        version: framework.version,
        sourceUrl: framework.sourceUrl,
      },
      cycles: cycles.map(toCycleView),
      selectedCycle: selected ? toCycleView(selected) : null,
      criteria,
      totals: {
        requirements: criteria.reduce((sum, item) => sum + item.total, 0),
        evidenceCovered: evidenceCodes.size,
        rated: ratedCodes.size,
        reviewedEvidence: reviewedCodes.size,
      },
      evidence: evidenceRows,
      selfAssessments,
    };
  },

  async createCycle(input: CreateQaCycleInput, userId: string): Promise<QaCycleView> {
    const [programme, framework] = await Promise.all([
      prisma.programme.findUnique({ where: { id: input.programmeId }, select: { id: true } }),
      prisma.qaFramework.findUnique({ where: { id: AUN_QA_V4_ID }, select: { id: true } }),
    ]);
    if (!programme || !framework) {
      throw new QaResourceNotFoundError("Programme or AUN-QA framework not found");
    }

    const created = await prisma.qaAssessmentCycle.create({
      data: {
        programmeId: input.programmeId,
        frameworkId: framework.id,
        title: input.title,
        reportingStart: input.reportingStart,
        reportingEnd: input.reportingEnd,
        status: "Active",
        createdById: userId,
      },
    });
    return toCycleView(created);
  },

  async createEvidence(
    cycleId: string,
    input: CreateQaEvidenceInput,
    userId: string,
  ): Promise<QaEvidenceView> {
    return createAndMapQaEvidence(cycleId, input, userId);
  },

  async upsertSelfAssessment(
    cycleId: string,
    requirementCode: string,
    input: UpsertQaSelfAssessmentInput,
    userId: string,
  ): Promise<QaSelfAssessmentView> {
    const [cycle, requirement] = await Promise.all([
      prisma.qaAssessmentCycle.findUnique({
        where: { id: cycleId },
        select: { programmeId: true, frameworkId: true },
      }),
      prisma.qaRequirement.findFirst({
        where: { code: requirementCode, criterion: { frameworkId: AUN_QA_V4_ID } },
        select: { id: true, code: true },
      }),
    ]);
    if (!cycle || !requirement) {
      throw new QaResourceNotFoundError("QA cycle or requirement not found");
    }
    if (cycle.programmeId !== input.programmeId || cycle.frameworkId !== AUN_QA_V4_ID) {
      throw new QaScopeMismatchError("Self-assessment does not belong to this programme cycle");
    }

    const saved = await prisma.qaRequirementAssessment.upsert({
      where: {
        cycleId_requirementId: { cycleId, requirementId: requirement.id },
      },
      update: {
        programmeId: input.programmeId,
        rating: input.rating,
        narrative: input.narrative,
        reviewerId: userId,
      },
      create: {
        programmeId: input.programmeId,
        cycleId,
        requirementId: requirement.id,
        rating: input.rating,
        narrative: input.narrative,
        reviewerId: userId,
      },
      include: { reviewer: { select: { name: true } } },
    });

    return {
      requirementCode: requirement.code,
      rating: saved.rating,
      narrative: saved.narrative,
      reviewerName: saved.reviewer?.name ?? "Unknown reviewer",
      updatedAt: saved.updatedAt.toISOString(),
    };
  },
};

export type QaService = typeof qaService;
