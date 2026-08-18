import type { QaEvidenceCandidateResultView, QaEvidenceCandidateView, QaEvidenceSourceDomain } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

export interface ContinuousImprovementDefinition { id: string; evidenceType: string; sourceDomain: QaEvidenceSourceDomain; }
type Row = { entityId: string; entityType: string; title: string; summary: string; reportingDate: Date; attributes: Record<string, string | number | boolean | null>; };

function candidate(def: ContinuousImprovementDefinition, programmeId: string, row: Row): QaEvidenceCandidateView {
  return {
    key: `${def.evidenceType}:${row.entityType}:${row.entityId}`, sourceKind: "structuredCandidate",
    evidenceType: def.evidenceType, sourceDomain: def.sourceDomain, title: row.title, summary: row.summary,
    entityType: row.entityType, entityId: row.entityId, route: null, reportingDate: row.reportingDate.toISOString(),
    scope: { programmeId },
    provenance: { authority: "controlledInternalRecord", ownerUnit: "DSE", version: null, approvalStatus: null, sourceUri: null },
    periodKey: String(row.reportingDate.getUTCFullYear()), attributes: row.attributes,
  };
}

export async function retrieveContinuousImprovementEvidence(
  programmeId: string, def: ContinuousImprovementDefinition,
): Promise<QaEvidenceCandidateResultView> {
  let rows: Row[] = [];
  if (def.evidenceType === "outcome-concerns") rows = await prisma.$queryRaw<Row[]>`
    SELECT a.id AS "entityId", 'QaEvidenceAnalysis' AS "entityType",
      'Outcome concern ' || r.code AS title, a.explanation AS summary, a."createdAt" AS "reportingDate",
      jsonb_build_object('analysisId', a.id, 'requirementCode', r.code, 'state', a.state::text) AS attributes
    FROM "QaEvidenceAnalysis" a JOIN "QaRequirement" r ON r.id = a."requirementId"
    WHERE a."programmeId" = ${programmeId} AND a.state IN ('PotentialEvidenceGap','ExpertReviewRequired')
    ORDER BY a."createdAt", a.id`;
  else if (def.evidenceType === "qa-review-records") rows = await prisma.$queryRaw<Row[]>`
    SELECT v.id AS "entityId", 'QaEvidenceAnalysisReview' AS "entityType",
      'Human review of QA concern' AS title, v.comment AS summary, v."createdAt" AS "reportingDate",
      jsonb_build_object('reviewId', v.id, 'analysisId', v."analysisId", 'decision', v.decision::text) AS attributes
    FROM "QaEvidenceAnalysisReview" v JOIN "QaEvidenceAnalysis" a ON a.id = v."analysisId"
    WHERE v."programmeId" = ${programmeId} AND a.state IN ('PotentialEvidenceGap','ExpertReviewRequired')
    ORDER BY v."createdAt", v.id`;
  else if (def.evidenceType === "improvement-actions") rows = await prisma.$queryRaw<Row[]>`
    SELECT x.id AS "entityId", 'QaImprovementAction' AS "entityType",
      'Improvement action: ' || left(x."plannedAction", 120) AS title, x.indicator AS summary, x."createdAt" AS "reportingDate",
      jsonb_build_object('actionId', x.id, 'analysisId', x."analysisId", 'reviewId', x."reviewId", 'status', x.status::text, 'ownerId', x."ownerId") AS attributes
    FROM "QaImprovementAction" x WHERE x."programmeId" = ${programmeId}
    ORDER BY x."createdAt", x.id`;
  else if (def.evidenceType === "follow-up-evidence") rows = await prisma.$queryRaw<Row[]>`
    SELECT f.id AS "entityId", 'QaImprovementActionFollowUp' AS "entityType",
      'Follow-up: ' || e.title AS title, COALESCE(NULLIF(f.note,''), e.description) AS summary, f."linkedAt" AS "reportingDate",
      jsonb_build_object('followUpId', f.id, 'actionId', f."actionId", 'evidenceId', f."evidenceId", 'analysisId', x."analysisId", 'reviewId', x."reviewId", 'evidenceStatus', e.status::text) AS attributes
    FROM "QaImprovementActionFollowUp" f
    JOIN "QaImprovementAction" x ON x.id = f."actionId"
    JOIN "QaEvidence" e ON e.id = f."evidenceId"
    WHERE f."programmeId" = ${programmeId}
    ORDER BY f."linkedAt", f.id`;
  return { programmeId, expectedEvidenceId: def.id, evidenceType: def.evidenceType, sourceDomain: def.sourceDomain, status: "supported", reason: "Explicit continuous-improvement relationships are retrieved from stored QA analysis, human review, action, and follow-up link identifiers.", candidates: rows.map((row) => candidate(def, programmeId, row)) };
}
