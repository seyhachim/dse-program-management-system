import {
  QA_STRUCTURED_EVIDENCE_TYPES,
  type QaEvidenceAttributeValue,
  type QaEvidenceCandidateResultView,
  type QaEvidenceCandidateView,
  type QaEvidenceSourceDomain,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

export interface ExpectedEvidenceDefinition {
  id: string;
  evidenceType: string;
  sourceDomain: QaEvidenceSourceDomain;
}

type CandidateRow = {
  entityId: string;
  entityType: string;
  title: string;
  summary: string;
  route: string | null;
  reportingDate: Date | string | null;
  attributes: unknown;
};

const supportedTypes = new Set<string>(QA_STRUCTURED_EVIDENCE_TYPES);

function toAttributes(value: unknown): Record<string, QaEvidenceAttributeValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, QaEvidenceAttributeValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      output[key] = item;
    } else {
      output[key] = JSON.stringify(item);
    }
  }
  return output;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toCandidates(
  definition: ExpectedEvidenceDefinition,
  rows: CandidateRow[],
): QaEvidenceCandidateView[] {
  return rows.map((row) => ({
    key: `${definition.evidenceType}:${row.entityType}:${row.entityId}`,
    evidenceType: definition.evidenceType,
    sourceDomain: definition.sourceDomain,
    title: row.title,
    summary: row.summary,
    entityType: row.entityType,
    entityId: row.entityId,
    route: row.route,
    reportingDate: toIso(row.reportingDate),
    attributes: toAttributes(row.attributes),
  }));
}

export function evidenceTypeSupportReason(definition: ExpectedEvidenceDefinition): string {
  if (supportedTypes.has(definition.evidenceType)) {
    return "Deterministic retrieval is available from current DSE-PMS structured data.";
  }
  if (["document", "survey", "minutes", "policy"].includes(definition.sourceDomain)) {
    return "This evidence requires linked/document retrieval and is intentionally deferred to issue #189.";
  }
  if (definition.evidenceType === "clo-achievement") {
    return "Published assessment results exist, but DSE-PMS does not yet persist a stable programme-level CLO-achievement record; deriving it belongs in the analysis layer rather than pretending a source record exists.";
  }
  if (definition.evidenceType === "rubrics") {
    return "Rubrics currently have no stable programme/course/assessment foreign key, so programme-scoped deterministic retrieval would be unsafe.";
  }
  return "No deterministic adapter is registered for this evidence type yet.";
}

async function queryRows(
  programmeId: string,
  evidenceType: string,
): Promise<CandidateRow[]> {
  switch (evidenceType) {
    case "clo-attainment-snapshots":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          s.id AS "entityId",
          'QaCloAttainmentSnapshot' AS "entityType",
          c.code || ' — ' || s."cloCode" || ' attainment (' || s."periodKey" || ')' AS title,
          CASE WHEN s."studentCount" = 0 THEN 'No finalized mapped-result population for this snapshot.'
            ELSE s."achievedCount"::text || '/' || s."studentCount"::text || ' students met the ' || s."thresholdPercentage"::text || '% threshold (' || s."achievedRate"::text || '%).' END AS summary,
          '/courses/' || c.id || '/spec' AS route,
          s."generatedAt" AS "reportingDate",
          jsonb_build_object(
            'courseSpecVersionId', s."courseSpecId", 'offeringId', s."offeringId", 'population', 'enrolled-students',
            'term', s."periodKey", 'periodKey', s."periodKey", 'cloCode', s."cloCode",
            'calculationVersion', s."calculationVersion", 'calculationHash', s."calculationHash",
            'thresholdPercentage', s."thresholdPercentage", 'populationSize', s."populationSize",
            'studentCount', s."studentCount", 'achievedCount', s."achievedCount", 'achievedRate', s."achievedRate"
          ) AS attributes
        FROM "QaCloAttainmentSnapshot" s
        JOIN "Course" c ON c.id = s."courseId"
        WHERE s."programmeId" = ${programmeId}
        ORDER BY s."generatedAt" DESC, c.code, s."cloCode"
      `;

    case "cohort-membership":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          m.id AS "entityId",
          'StudentCohortMembership' AS "entityType",
          s."studentId" || ' — ' || c.code || ' cohort membership' AS title,
          'Joined ' || m."joinedAt"::text || CASE WHEN m."exitedAt" IS NULL THEN '; active membership.' ELSE '; exited ' || m."exitedAt"::text || '.' END AS summary,
          '/students' AS route,
          m."joinedAt" AS "reportingDate",
          jsonb_build_object(
            'cohortId', c.id,
            'cohortCode', c.code,
            'studentId', s.id,
            'population', 'student',
            'joinedAt', m."joinedAt"::text,
            'exitedAt', m."exitedAt"::text,
            'exitReason', m."exitReason"::text,
            'finalized', true
          ) AS attributes
        FROM "StudentCohortMembership" m
        JOIN "StudentCohort" c ON c.id = m."cohortId"
        JOIN "Student" s ON s.id = m."studentId"
        WHERE c."programmeId" = ${programmeId}
        ORDER BY c."intakeYear", c.code, s."studentId", m."joinedAt"
      `;

    case "student-progression-records":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          p.id AS "entityId",
          'StudentProgressionRecord' AS "entityType",
          s."studentId" || ' — ' || p."academicYear" || ' ' || p.term AS title,
          p.status::text || CASE WHEN p.note = '' THEN '.' ELSE ': ' || p.note END AS summary,
          '/students' AS route,
          p."periodEnd" AS "reportingDate",
          jsonb_build_object(
            'cohortId', c.id,
            'cohortCode', c.code,
            'studentId', s.id,
            'academicYear', p."academicYear",
            'term', p.term,
            'periodKey', p."academicYear" || ':' || p.term,
            'population', 'student',
            'status', p.status::text,
            'finalized', true
          ) AS attributes
        FROM "StudentProgressionRecord" p
        JOIN "StudentCohortMembership" m ON m.id = p."membershipId"
        JOIN "StudentCohort" c ON c.id = m."cohortId"
        JOIN "Student" s ON s.id = m."studentId"
        WHERE c."programmeId" = ${programmeId}
        ORDER BY p."periodStart", c.code, s."studentId"
      `;
    case "programme-outcomes":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          plo.id AS "entityId",
          'ProgramLearningOutcome' AS "entityType",
          plo.code || ' — Programme Learning Outcome' AS title,
          plo.description AS summary,
          '/programme' AS route,
          plo."updatedAt" AS "reportingDate",
          jsonb_build_object('code', plo.code, 'order', plo."order") AS attributes
        FROM "ProgramLearningOutcome" plo
        WHERE plo.active = true
        ORDER BY plo."order"
      `;

    case "programme-profile":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          p.id AS "entityId",
          'ProgrammeProfile' AS "entityType",
          'Programme profile' AS title,
          CASE WHEN p.vision <> '' THEN p.vision ELSE 'Programme profile is recorded.' END AS summary,
          '/programme' AS route,
          p."updatedAt" AS "reportingDate",
          jsonb_build_object(
            'missionItems', jsonb_array_length(p.mission::jsonb),
            'goalItems', jsonb_array_length(p.goals::jsonb),
            'philosophyItems', jsonb_array_length(p."educationalPhilosophy"::jsonb),
            'peoItems', jsonb_array_length(p.peos::jsonb)
          ) AS attributes
        FROM "ProgrammeProfile" p
        WHERE p.id = ${programmeId}
      `;

    case "educational-philosophy":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          p.id AS "entityId",
          'ProgrammeProfile' AS "entityType",
          'Programme educational philosophy' AS title,
          p."educationalPhilosophy"::text AS summary,
          '/programme' AS route,
          p."updatedAt" AS "reportingDate",
          jsonb_build_object('items', jsonb_array_length(p."educationalPhilosophy"::jsonb)) AS attributes
        FROM "ProgrammeProfile" p
        WHERE p.id = ${programmeId}
      `;

    case "programme-structure":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          c.id AS "entityId",
          'Course' AS "entityType",
          c.code || ' — ' || c.title AS title,
          COALESCE(c.description, 'Course in the current programme catalogue.') AS summary,
          '/courses/' || c.id AS route,
          c."createdAt" AS "reportingDate",
          jsonb_build_object(
            'code', c.code,
            'credits', c.credits,
            'courseType', c."courseType"::text
          ) AS attributes
        FROM "Course" c
        WHERE c."programmeId" = ${programmeId}
        ORDER BY c.code
      `;

    case "clo-plo-mappings":
    case "course-clo-plo-coverage":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          cs.id AS "entityId",
          'CourseSpec' AS "entityType",
          c.code || ' — CLO to PLO mapping' AS title,
          COUNT(clo.id)::text || ' active CLO(s); ' ||
            COUNT(clo.id) FILTER (WHERE cardinality(clo."mappedPlos") > 0)::text ||
            ' mapped to at least one PLO.' AS summary,
          '/courses/' || c.id || '/spec' AS route,
          cs."updatedAt" AS "reportingDate",
          jsonb_build_object(
            'courseCode', c.code,
            'activeClos', COUNT(clo.id),
            'mappedClos', COUNT(clo.id) FILTER (WHERE cardinality(clo."mappedPlos") > 0),
            'reviewStatus', cs."reviewStatus"::text
          ) AS attributes
        FROM "Course" c
        JOIN "CourseSpec" cs ON cs."courseId" = c.id
        LEFT JOIN "CourseSpecClo" clo
          ON clo."courseSpecId" = cs.id AND clo.status = 'Active'
        WHERE c."programmeId" = ${programmeId}
        GROUP BY cs.id, c.id, c.code, cs."updatedAt", cs."reviewStatus"
        ORDER BY c.code
      `;

    case "approved-course-specs":
    case "approved-course-specifications":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          cs.id AS "entityId",
          'CourseSpec' AS "entityType",
          c.code || ' — Approved course specification' AS title,
          c.title AS summary,
          '/courses/' || c.id || '/spec' AS route,
          cs."updatedAt" AS "reportingDate",
          jsonb_build_object(
            'courseCode', c.code,
            'reviewStatus', cs."reviewStatus"::text,
            'submissionVersion', cs."submissionVersion"
          ) AS attributes
        FROM "Course" c
        JOIN "CourseSpec" cs ON cs."courseId" = c.id
        WHERE c."programmeId" = ${programmeId}
          AND cs."reviewStatus" = 'Approved'
        ORDER BY c.code
      `;

    case "approval-history":
    case "course-spec-review-history":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          a.id AS "entityId",
          'CourseSpecReviewAction' AS "entityType",
          c.code || ' — ' || a.action::text AS title,
          CASE WHEN a.note <> '' THEN a.note ELSE 'Course specification review action.' END AS summary,
          '/courses/' || c.id || '/spec' AS route,
          a."createdAt" AS "reportingDate",
          jsonb_build_object(
            'courseCode', c.code,
            'action', a.action::text,
            'submissionVersion', a."submissionVersion"
          ) AS attributes
        FROM "Course" c
        JOIN "CourseSpec" cs ON cs."courseId" = c.id
        JOIN "CourseSpecReviewAction" a ON a."courseSpecId" = cs.id
        WHERE c."programmeId" = ${programmeId}
        ORDER BY a."createdAt" DESC
      `;

    case "clo-teaching-alignment":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          cs.id AS "entityId",
          'CourseSpec' AS "entityType",
          c.code || ' — CLO teaching alignment' AS title,
          COUNT(clo.id)::text || ' active CLO(s); ' ||
            COUNT(clo.id) FILTER (
              WHERE cardinality(clo."activeLearningStrategyIds") > 0
                 OR EXISTS (
                   SELECT 1 FROM "CourseSpecCloTeachingMethod" tm
                   WHERE tm."courseSpecId" = clo."courseSpecId" AND tm."cloId" = clo.id
                 )
            )::text || ' with teaching support.' AS summary,
          '/courses/' || c.id || '/spec' AS route,
          cs."updatedAt" AS "reportingDate",
          jsonb_build_object(
            'courseCode', c.code,
            'activeClos', COUNT(clo.id),
            'supportedClos', COUNT(clo.id) FILTER (
              WHERE cardinality(clo."activeLearningStrategyIds") > 0
                 OR EXISTS (
                   SELECT 1 FROM "CourseSpecCloTeachingMethod" tm
                   WHERE tm."courseSpecId" = clo."courseSpecId" AND tm."cloId" = clo.id
                 )
            )
          ) AS attributes
        FROM "Course" c
        JOIN "CourseSpec" cs ON cs."courseId" = c.id
        LEFT JOIN "CourseSpecClo" clo
          ON clo."courseSpecId" = cs.id AND clo.status = 'Active'
        WHERE c."programmeId" = ${programmeId}
        GROUP BY cs.id, c.id, c.code, cs."updatedAt"
        ORDER BY c.code
      `;

    case "course-teaching-philosophy":
    case "active-learning-strategies":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          tl."courseSpecId" AS "entityId",
          'CourseSpecTeachingLearning' AS "entityType",
          c.code || ' — Teaching and learning strategy' AS title,
          CASE
            WHEN tl."philosophyStatement" <> '' THEN tl."philosophyStatement"
            ELSE 'Course-level teaching and learning strategy is recorded.'
          END AS summary,
          '/courses/' || c.id || '/spec' AS route,
          tl."updatedAt" AS "reportingDate",
          jsonb_build_object(
            'courseCode', c.code,
            'philosophyTags', array_to_string(tl."philosophyTags", ', '),
            'teachingMethodCount', cardinality(tl."teachingMethodIds"),
            'activeLearningCount', cardinality(tl."activeLearningStrategyIds")
          ) AS attributes
        FROM "Course" c
        JOIN "CourseSpec" cs ON cs."courseId" = c.id
        JOIN "CourseSpecTeachingLearning" tl ON tl."courseSpecId" = cs.id
        WHERE c."programmeId" = ${programmeId}
        ORDER BY c.code
      `;

    case "weekly-alignment":
    case "weekly-student-activities":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          w."courseSpecId" || ':' || w.id AS "entityId",
          'CourseSpecWeek' AS "entityType",
          c.code || ' — Week ' || w.week::text || ': ' || COALESCE(NULLIF(w.topic, ''), 'Weekly plan') AS title,
          'CLOs: ' || COALESCE(array_to_string(w."cloCodes", ', '), '') ||
            '; teaching methods: ' || cardinality(w."teachingMethodIds")::text ||
            '; assessment methods: ' || cardinality(w."assessmentMethodIds")::text || '.' AS summary,
          '/courses/' || c.id || '/spec' AS route,
          cs."updatedAt" AS "reportingDate",
          jsonb_build_object(
            'courseCode', c.code,
            'week', w.week,
            'cloCount', cardinality(w."cloCodes"),
            'activityCount', cardinality(w.activities),
            'teachingMethodCount', cardinality(w."teachingMethodIds"),
            'assessmentMethodCount', cardinality(w."assessmentMethodIds"),
            'studentLearningActivities', COALESCE(w."studentLearningActivities"::text, '')
          ) AS attributes
        FROM "Course" c
        JOIN "CourseSpec" cs ON cs."courseId" = c.id
        JOIN "CourseSpecWeek" w ON w."courseSpecId" = cs.id
        WHERE c."programmeId" = ${programmeId}
        ORDER BY c.code, w."order"
      `;

    case "clo-assessment-alignment":
    case "clo-assessment-methods":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          clo."courseSpecId" || ':' || clo.id AS "entityId",
          'CourseSpecClo' AS "entityType",
          c.code || ' — CLO ' || (clo."order" + 1)::text || ' assessment alignment' AS title,
          COUNT(am."assessmentMethodId")::text || ' linked assessment method(s).' AS summary,
          '/courses/' || c.id || '/spec' AS route,
          cs."updatedAt" AS "reportingDate",
          jsonb_build_object(
            'courseCode', c.code,
            'cloOrder', clo."order",
            'assessmentMethodCount', COUNT(am."assessmentMethodId")
          ) AS attributes
        FROM "Course" c
        JOIN "CourseSpec" cs ON cs."courseId" = c.id
        JOIN "CourseSpecClo" clo ON clo."courseSpecId" = cs.id AND clo.status = 'Active'
        LEFT JOIN "CourseSpecCloAssessmentMethod" am
          ON am."courseSpecId" = clo."courseSpecId" AND am."cloId" = clo.id
        WHERE c."programmeId" = ${programmeId}
        GROUP BY clo."courseSpecId", clo.id, clo."order", c.id, c.code, cs."updatedAt"
        ORDER BY c.code, clo."order"
      `;

    case "assessment-plan":
    case "feedback-plan":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          a."courseSpecId" || ':' || a.id AS "entityId",
          'CourseSpecAssessmentItem' AS "entityType",
          c.code || ' — ' || a.name AS title,
          COALESCE(NULLIF(a.description, ''), a.type) AS summary,
          '/courses/' || c.id || '/spec' AS route,
          cs."updatedAt" AS "reportingDate",
          jsonb_build_object(
            'courseCode', c.code,
            'assessmentType', a.type,
            'weight', a.weight,
            'cloCount', cardinality(a."cloCodes"),
            'feedbackMethod', a."feedbackMethod",
            'feedbackTimeline', a."feedbackTimeline"
          ) AS attributes
        FROM "Course" c
        JOIN "CourseSpec" cs ON cs."courseId" = c.id
        JOIN "CourseSpecAssessmentItem" a ON a."courseSpecId" = cs.id
        WHERE c."programmeId" = ${programmeId}
          AND a.status = 'Active'
        ORDER BY c.code, a."order"
      `;

    case "published-results":
    case "published-feedback":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          r."courseSpecId" || ':' || r."assessmentItemId" AS "entityId",
          'AssessmentResultSet' AS "entityType",
          c.code || ' — Published results for ' || COALESCE(a.name, r."assessmentItemId") AS title,
          COUNT(r.id)::text || ' published result(s).' AS summary,
          '/courses/' || c.id AS route,
          MAX(r."publishedAt") AS "reportingDate",
          jsonb_build_object(
            'courseCode', c.code,
            'resultCount', COUNT(r.id),
            'feedbackCount', COUNT(r.id) FILTER (WHERE r.feedback <> ''),
            'averagePercent', ROUND(AVG(CASE WHEN r."maxScore" > 0 THEN (r.score / r."maxScore") * 100 ELSE NULL END)::numeric, 2)
          ) AS attributes
        FROM "AssessmentResult" r
        JOIN "Enrollment" e ON e.id = r."enrollmentId"
        JOIN "Offering" o ON o.id = e."offeringId"
        JOIN "Course" c ON c.id = o."courseId"
        LEFT JOIN "CourseSpecAssessmentItem" a
          ON a."courseSpecId" = r."courseSpecId" AND a.id = r."assessmentItemId"
        WHERE c."programmeId" = ${programmeId}
          AND r."publishedAt" IS NOT NULL
        GROUP BY r."courseSpecId", r."assessmentItemId", c.id, c.code, a.name
        ORDER BY c.code
      `;

    case "lecturer-assignments":
    case "teaching-assignments":
      return prisma.$queryRaw<CandidateRow[]>`
        SELECT
          o.id AS "entityId",
          'Offering' AS "entityType",
          c.code || ' ' || o.term || ' Section ' || o."sectionCode" AS title,
          'Primary lecturer: ' || COALESCE(u.name, 'Unassigned') ||
            '; co-lecturers: ' || (
              SELECT COUNT(*)::text FROM "OfferingCoLecturer" oc WHERE oc."offeringId" = o.id
            ) || '.' AS summary,
          '/courses/' || c.id AS route,
          o."createdAt" AS "reportingDate",
          jsonb_build_object(
            'courseCode', c.code,
            'term', o.term,
            'sectionCode', o."sectionCode",
            'primaryLecturer', COALESCE(u.name, ''),
            'coLecturerCount', (SELECT COUNT(*) FROM "OfferingCoLecturer" oc WHERE oc."offeringId" = o.id)
          ) AS attributes
        FROM "Offering" o
        JOIN "Course" c ON c.id = o."courseId"
        LEFT JOIN "User" u ON u.id = o."lecturerId"
        WHERE c."programmeId" = ${programmeId}
        ORDER BY o.term DESC, c.code, o."sectionCode"
      `;

    case "weekly-workload":
      return prisma.$queryRaw<CandidateRow[]>`
        WITH assignments AS (
          SELECT o.id AS "offeringId", o."lecturerId" AS "lecturerId"
          FROM "Offering" o
          JOIN "Course" c ON c.id = o."courseId"
          WHERE c."programmeId" = ${programmeId} AND o."lecturerId" IS NOT NULL
          UNION ALL
          SELECT o.id AS "offeringId", oc."lecturerId" AS "lecturerId"
          FROM "Offering" o
          JOIN "Course" c ON c.id = o."courseId"
          JOIN "OfferingCoLecturer" oc ON oc."offeringId" = o.id
          WHERE c."programmeId" = ${programmeId}
        )
        SELECT
          m.id || ':' || a."lecturerId" AS "entityId",
          'OfferingMeetingWorkload' AS "entityType",
          u.name || ' — ' || c.code || ' ' || m."activityType" AS title,
          m."dayOfWeek" || ' ' || m."startTime" || '–' || m."endTime" ||
            CASE WHEN m.room IS NOT NULL AND m.room <> '' THEN ' (' || m.room || ')' ELSE '' END AS summary,
          '/courses/' || c.id AS route,
          o."createdAt" AS "reportingDate",
          jsonb_build_object(
            'lecturerId', u.id,
            'lecturerName', u.name,
            'courseCode', c.code,
            'term', o.term,
            'sectionCode', o."sectionCode",
            'dayOfWeek', m."dayOfWeek",
            'startTime', m."startTime",
            'endTime', m."endTime",
            'activityType', m."activityType"
          ) AS attributes
        FROM assignments a
        JOIN "Offering" o ON o.id = a."offeringId"
        JOIN "Course" c ON c.id = o."courseId"
        JOIN "User" u ON u.id = a."lecturerId"
        JOIN "OfferingMeeting" m ON m."offeringId" = o.id
        ORDER BY u.name, o.term DESC, c.code, m."dayOfWeek", m."startTime"
      `;

    case "staff-profile":
      return prisma.$queryRaw<CandidateRow[]>`
        WITH assigned_staff AS (
          SELECT DISTINCT o."lecturerId" AS id
          FROM "Offering" o
          JOIN "Course" c ON c.id = o."courseId"
          WHERE c."programmeId" = ${programmeId} AND o."lecturerId" IS NOT NULL
          UNION
          SELECT DISTINCT oc."lecturerId" AS id
          FROM "OfferingCoLecturer" oc
          JOIN "Offering" o ON o.id = oc."offeringId"
          JOIN "Course" c ON c.id = o."courseId"
          WHERE c."programmeId" = ${programmeId}
        )
        SELECT
          u.id AS "entityId",
          'User' AS "entityType",
          u.name AS title,
          COALESCE(NULLIF(u.qualification, ''), 'Qualification not recorded.') AS summary,
          NULL::text AS route,
          u."createdAt" AS "reportingDate",
          jsonb_build_object(
            'title', COALESCE(u.title, ''),
            'qualification', COALESCE(u.qualification, ''),
            'email', u.email
          ) AS attributes
        FROM assigned_staff s
        JOIN "User" u ON u.id = s.id
        ORDER BY u.name
      `;

    default:
      return [];
  }
}

export async function retrieveEvidenceCandidates(
  programmeId: string,
  definition: ExpectedEvidenceDefinition,
): Promise<QaEvidenceCandidateResultView> {
  if (!supportedTypes.has(definition.evidenceType)) {
    return {
      programmeId,
      expectedEvidenceId: definition.id,
      evidenceType: definition.evidenceType,
      sourceDomain: definition.sourceDomain,
      status: "unsupported",
      reason: evidenceTypeSupportReason(definition),
      candidates: [],
    };
  }

  const rows = await queryRows(programmeId, definition.evidenceType);
  return {
    programmeId,
    expectedEvidenceId: definition.id,
    evidenceType: definition.evidenceType,
    sourceDomain: definition.sourceDomain,
    status: "supported",
    reason: evidenceTypeSupportReason(definition),
    candidates: toCandidates(definition, rows),
  };
}
