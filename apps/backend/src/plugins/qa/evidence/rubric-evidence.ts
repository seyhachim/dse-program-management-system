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

export function rubricEvidenceCandidate(
  programmeId: string,
  definition: RubricEvidenceDefinition,
  row: RubricEvidenceRow,
): QaEvidenceCandidateView {
  const criterionCount = Number(row.criterionCount);
  const approvedSpec = row.courseSpecReviewStatus === "Approved";
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
    route: `/courses/${row.courseId}/spec`,
    reportingDate: row.rubricUpdatedAt.toISOString(),
    scope: {
      programmeId,
      courseId: row.courseId,
      courseSpecVersionId: row.courseSpecId,
      assessmentId: row.assessmentItemId,
    },
    provenance: {
      // The rubric is being cited as part of an exact CourseSpec assessment.
      // An approved CourseSpec therefore makes the linked immutable rubric
      // approved-document evidence; draft/review specs remain controlled records.
      authority: approvedSpec ? "approvedDocument" : "controlledInternalRecord",
      ownerUnit: "DSE",
      // Published rubric content is immutable; archiving does not alter content,
      // so the stable rubric id acts as its version identity.
      version: row.rubricId,
      approvalStatus: `${row.courseSpecReviewStatus}/${row.rubricStatus}`,
      sourceUri: `/courses/${row.courseId}/spec`,
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
 * Retrieve only rubrics that are actually linked by an active assessment row in
 * a CourseSpec owned by the requested programme. Unlinked library rubrics never
 * enter the result. Archived rubrics remain retrievable when still linked so an
 * historical CourseSpec can preserve its exact rubric identity; Draft rubrics
 * are excluded from QA evidence until published.
 */
export async function retrieveRubricEvidenceCandidates(
  programmeId: string,
  definition: RubricEvidenceDefinition,
): Promise<QaEvidenceCandidateResultView> {
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
      AND r.status IN ('Active', 'Archived')
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
      "Deterministic retrieval uses exact CourseSpecAssessmentItem.rubricId links; unlinked and Draft library rubrics are excluded while linked Archived rubrics remain traceable.",
    candidates: rows.map((row) => rubricEvidenceCandidate(programmeId, definition, row)),
  };
}
