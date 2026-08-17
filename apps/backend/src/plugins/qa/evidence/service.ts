import {
  AUN_QA_V4_ID,
  QaEvidenceSourceDomainSchema,
  type QaEvidenceCandidateResultView,
  type QaEvidenceCandidateView,
  type QaEvidenceProvenance,
  type QaEvidenceScope,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  retrieveSemanticDocumentEvidence,
  type QaSemanticEvidenceDefinition,
} from "../documents/semantic.ts";
import type { QaEmbeddingProvider } from "../documents/embedding.ts";
import {
  retrieveEvidenceCandidates,
  type ExpectedEvidenceDefinition,
} from "./registry.ts";

type DefinitionRow = {
  id: string;
  evidenceType: string;
  description: string;
  sourceDomain: string;
  expectationStatement: string;
};

export class QaEvidenceCandidateResourceNotFoundError extends Error {}

const semanticDomains = new Set(["document", "survey", "minutes", "policy"]);

function routeCourseId(route: string | null): string | undefined {
  const match = route?.match(/^\/courses\/([^/]+)/);
  return match?.[1];
}

function inferScope(programmeId: string, candidate: QaEvidenceCandidateView): QaEvidenceScope {
  const scope: QaEvidenceScope = { programmeId };
  const courseId = routeCourseId(candidate.route);
  if (courseId) scope.courseId = courseId;

  const entityParts = candidate.entityId.split(":");
  if (candidate.entityType === "Course") scope.courseId = candidate.entityId;
  if (candidate.entityType === "Offering") scope.offeringId = candidate.entityId;
  if (candidate.entityType === "CourseSpec" || candidate.entityType === "CourseSpecTeachingLearning") {
    scope.courseSpecVersionId = candidate.entityId;
  }
  if (
    ["CourseSpecWeek", "CourseSpecClo", "CourseSpecAssessmentItem", "AssessmentResultSet"].includes(candidate.entityType) &&
    entityParts.length >= 2
  ) {
    scope.courseSpecVersionId = entityParts[0];
  }
  if (
    ["CourseSpecAssessmentItem", "AssessmentResultSet"].includes(candidate.entityType) &&
    entityParts.length >= 2
  ) {
    scope.assessmentId = entityParts.slice(1).join(":");
  }

  const academicYear = candidate.attributes.academicYear;
  const term = candidate.attributes.term;
  const cohortId = candidate.attributes.cohortId;
  const population = candidate.attributes.population;
  const courseSpecVersionId = candidate.attributes.courseSpecVersionId;
  const offeringId = candidate.attributes.offeringId;
  const assessmentId = candidate.attributes.assessmentId;
  if (typeof courseSpecVersionId === "string" && courseSpecVersionId.trim()) scope.courseSpecVersionId = courseSpecVersionId;
  if (typeof offeringId === "string" && offeringId.trim()) scope.offeringId = offeringId;
  if (typeof assessmentId === "string" && assessmentId.trim()) scope.assessmentId = assessmentId;
  if (typeof academicYear === "string" && academicYear.trim()) scope.academicYear = academicYear;
  if (typeof term === "string" && term.trim()) scope.term = term;
  if (typeof cohortId === "string" && cohortId.trim()) scope.cohortId = cohortId;
  if (typeof population === "string" && population.trim()) scope.population = population;
  return scope;
}

function inferProvenance(candidate: QaEvidenceCandidateView): QaEvidenceProvenance {
  const reviewStatus = candidate.attributes.reviewStatus;
  const submissionVersion = candidate.attributes.submissionVersion;
  const finalized = candidate.attributes.finalized;

  let authority: QaEvidenceProvenance["authority"];
  if (["document", "survey", "minutes", "policy"].includes(candidate.sourceDomain)) {
    authority = "uploadedExternalDocument";
  } else if (reviewStatus === "Approved") {
    authority = "approvedDocument";
  } else if (finalized === true) {
    authority = "officialInstitutionalRecord";
  } else {
    authority = "controlledInternalRecord";
  }

  return {
    authority,
    ownerUnit: "DSE",
    version:
      typeof submissionVersion === "number" || typeof submissionVersion === "string"
        ? String(submissionVersion)
        : null,
    approvalStatus: typeof reviewStatus === "string" ? reviewStatus : null,
    sourceUri: candidate.route,
  };
}

function inferPeriodKey(candidate: QaEvidenceCandidateView): string | null {
  const explicit = candidate.attributes.periodKey ?? candidate.attributes.academicYear ?? candidate.attributes.term;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (!candidate.reportingDate) return null;
  const date = new Date(candidate.reportingDate);
  return Number.isNaN(date.getTime()) ? null : String(date.getUTCFullYear());
}

function normalizeCandidateSemantics(
  programmeId: string,
  result: QaEvidenceCandidateResultView,
): QaEvidenceCandidateResultView {
  return {
    ...result,
    candidates: result.candidates.map((candidate) => ({
      ...candidate,
      scope: candidate.scope ?? inferScope(programmeId, candidate),
      provenance: candidate.provenance ?? inferProvenance(candidate),
      periodKey: candidate.periodKey ?? inferPeriodKey(candidate),
    })),
  };
}

export async function getQaEvidenceCandidates(
  programmeId: string,
  expectedEvidenceId: string,
  options: { topK?: number; embeddingProvider?: QaEmbeddingProvider | null } = {},
): Promise<QaEvidenceCandidateResultView> {
  const [programme, definitions] = await Promise.all([
    prisma.programme.findUnique({ where: { id: programmeId }, select: { id: true } }),
    prisma.$queryRaw<DefinitionRow[]>`
      SELECT
        x.id,
        x."evidenceType",
        x.description,
        x."sourceDomain",
        e.statement AS "expectationStatement"
      FROM "QaExpectedEvidence" x
      JOIN "QaQualityExpectation" e ON e.id = x."expectationId"
      JOIN "QaRequirement" r ON r.id = e."requirementId"
      JOIN "QaCriterion" c ON c.id = r."criterionId"
      WHERE x.id = ${expectedEvidenceId}
        AND c."frameworkId" = ${AUN_QA_V4_ID}
        AND e.active = true
      LIMIT 1
    `,
  ]);

  const row = definitions[0];
  if (!programme) {
    throw new QaEvidenceCandidateResourceNotFoundError("Programme not found");
  }
  if (!row) {
    throw new QaEvidenceCandidateResourceNotFoundError("Expected evidence definition not found");
  }

  const sourceDomain = QaEvidenceSourceDomainSchema.safeParse(row.sourceDomain);
  if (!sourceDomain.success) {
    throw new Error(`Unsupported QA evidence source domain: ${row.sourceDomain}`);
  }

  if (semanticDomains.has(sourceDomain.data)) {
    const definition: QaSemanticEvidenceDefinition = {
      id: row.id,
      evidenceType: row.evidenceType,
      description: row.description,
      sourceDomain: sourceDomain.data,
      expectationStatement: row.expectationStatement,
    };
    const result = await retrieveSemanticDocumentEvidence(
      programmeId,
      definition,
      options.topK ?? 10,
      options.embeddingProvider,
    );
    return normalizeCandidateSemantics(programmeId, result);
  }

  const definition: ExpectedEvidenceDefinition = {
    id: row.id,
    evidenceType: row.evidenceType,
    sourceDomain: sourceDomain.data,
  };
  return normalizeCandidateSemantics(
    programmeId,
    await retrieveEvidenceCandidates(programmeId, definition),
  );
}
