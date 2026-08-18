import type {
  QaEvidenceCandidateResultView,
  QaEvidenceCandidateView,
  QaEvidenceSourceDomain,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

export type RubricEvidenceDefinition = {
  id: string;
  evidenceType: string;
  sourceDomain: QaEvidenceSourceDomain;
};

export type RubricEvidenceViewer = {
  id: string;
  roles: readonly string[];
};

type RubricEvidenceRow = {
  courseId: string;
  courseCode: string;
  courseSpecId: string;
  courseSpecReviewStatus: string;
  assessmentItemId: string;
  assessmentName: string;
  rubricId: string;
  rubricName: string;
  rubricType: string;
  rubricStatus: "Active" | "Archived";
  rubricUpdatedAt: Date;
  criterionCount: number | bigint;
  criteriaSummary: string;
};

export function canReadRubricEvidence(
  status: "Active" | "Archived",
  ownerId: string | null,
  viewer?: RubricEvidenceViewer,
): boolean {
  if (status === "Active") return true;
  if (!viewer) return false;
  return (
    ownerId === viewer.id ||
    viewer.roles.some((role) => role === "admin" || role === "program_coordinator")
  );
}

function exactRubricSourceUri(row: RubricEvidenceRow): string {
  return `pms://course-spec/${row.courseSpecId}/assessment/${row.assessmentItemId}/rubric/${row.rubricId}`;
}

export function rubricEvidenceCandidate(
  programmeId: string,
  definition: RubricEvidenceDefinition,
  row: RubricEvidenceRow,
): QaEvidenceCandidateView {
  const criterionCount = Number(row.criterionCount);
  const approvedSpec = row.courseSpecReviewStatus === "Approved";
  const sourceUri = exactRubricSourceUri(row);
  return {
    key: `${definition.evidenceType}:CourseSpecAssessmentRubric:${row.courseSpecId}:${row.assessmentItemId}:${row.rubricId}`,
    evidenceType: definition.evidenceType,
    sourceDomain: definition.sourceDomain,
    title: `${row.courseCode} — ${row.assessmentName} — ${row.rubricName}`,
    summary:
      criterionCount > 0
        ? `${criterionCount} rubric criterion(s): ${row.criteriaSummary}`
        : "Linked rubric has no criteria.",
    entityType: "CourseSpecAssessmentRubric",
    entityId: `${row.courseSpecId}:${row.assessmentItemId}:${row.rubricId}`,
    // The current CourseSpec page loads the newest version, so linking there
    // would misrepresent historical evidence. Keep this non-navigable until the
    // exact-version history UI (#210) provides a truthful route.
    route: null,
    reportingDate: row.rubricUpdatedAt.toISOString(),
    scope: {
      programmeId,
      courseId: row.courseId,
      courseSpecVersionId: row.courseSpecId,
      assessmentId: row.assessmentItemId,
    },
    provenance: {
      authority: approvedSpec ? "approvedDocument" : "controlledInternalRecord",
      ownerUnit: "DSE",
      version: row.rubricId,
      approvalStatus: `${row.courseSpecReviewStatus}/${row.rubricStatus}`,
      sourceUri,
    },
    periodKey: null,
    attributes: {
      courseCode: row.courseCode,
      courseSpecId: row.courseSpecId,
      courseSpecReviewStatus: row.courseSpecReviewStatus,
      assessmentItemId: row.assessmentItemId,
      assessmentName: row.assessmentName,
      rubricId: row.rubricId,
      rubricVersion: row.rubricId,
      rubricName: row.rubricName,
      rubricType: row.rubricType,
      rubricStatus: row.rubricStatus,
      criterionCount,
    },
  };
}

/**
 * Retrieve only rubrics linked by an active assessment row in the requested
 * programme. Active rubrics are readable to QA readers. Archived rubrics follow
 * the existing rubric lifecycle visibility boundary: owner or programme
 * leadership only. Draft rubrics and unlinked library entries never enter the
 * result.
 */
export async function retrieveRubricEvidenceCandidates(
  programmeId: string,
  definition: RubricEvidenceDefinition,
  viewer?: RubricEvidenceViewer,
): Promise<QaEvidenceCandidateResultView> {
  const viewerId = viewer?.id ?? "";
  const canReadAllArchived =
    viewer?.roles.some((role) => role === "admin" || role === "program_coordinator") ?? false;

  const rows = await prisma.$queryRaw<RubricEvidenceRow[]>`
    SELECT
      c.id AS "courseId",
      c.code AS "courseCode",
      cs.id AS "courseSpecId",
      cs."reviewStatus"::text AS "courseSpecReviewStatus",
      a.id AS "assessmentItemId",
      a.name AS "assessmentName",
      r.id AS "rubricId",
      r.name AS "rubricName",
      r.type AS "rubricType",
      r.status::text AS "rubricStatus",
      r."updatedAt" AS "rubricUpdatedAt",
      COUNT(rc.id) AS "criterionCount",
      COALESCE(string_agg(rc.name, ', ' ORDER BY rc."order"), '') AS "criteriaSummary"
    FROM "Course" c
    JOIN "CourseSpec" cs ON cs."courseId" = c.id
    JOIN "CourseSpecAssessmentItem" a ON a."courseSpecId" = cs.id
    JOIN "Rubric" r ON r.id = a."rubricId"
    LEFT JOIN "RubricCriterion" rc ON rc."rubricId" = r.id
    WHERE c."programmeId" = ${programmeId}
      AND a.status = 'Active'
      AND (
        r.status = 'Active'
        OR (
          r.status = 'Archived'
          AND (${canReadAllArchived} OR r."ownerId" = ${viewerId})
        )
      )
    GROUP BY
      c.id, c.code, cs.id, cs."reviewStatus", a.id, a.name,
      r.id, r.name, r.type, r.status, r."updatedAt"
    ORDER BY c.code, cs."versionMajor", cs."versionMinor", a."order"
  `;

  return {
    programmeId,
    expectedEvidenceId: definition.id,
    evidenceType: definition.evidenceType,
    sourceDomain: definition.sourceDomain,
    status: "supported",
    reason:
      "Deterministic retrieval uses exact CourseSpecAssessmentItem.rubricId links; unlinked and Draft rubrics are excluded, and Archived rubric visibility follows the rubric lifecycle policy.",
    candidates: rows.map((row) => rubricEvidenceCandidate(programmeId, definition, row)),
  };
}
