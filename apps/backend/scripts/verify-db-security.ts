import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXPECTED_PUBLIC_TABLES = [
  "User",
  "UserSecurityAuditEvent",
  "LecturerProfile",
  "Role",
  "Programme",
  "ProgrammeFaq",
  "ProgrammeImportantDate",
  "ProgrammePublicProfile",
  "AcademicYear",
  "AcademicCalendar",
  "AcademicCalendarStudyYear",
  "AcademicCalendarPeriod",
  "AcademicCalendarEvent",
  "AcademicCalendarAuditAction",
  "Permission",
  "RolePermission",
  "UserRoleAssignment",
  "Student",
  "StudentProfile",
  "StudentPortfolioProfile",
  "StudentPortfolioEvidence",
  "StudentPortfolioEvidenceLink",
  "StudentPortfolioProfessionalLink",
  "StudentPortfolioSupervisorRelationship",
  "StudentPortfolioVerificationEvent",
  "StudentPortfolioEvidenceSoftSkill",
  "StudentCohort",
  "StudentCohortMembership",
  "StudentCohortSection",
  "StudentCohortSectionMembership",
  "StudentProgressionRecord",
  "QaCloAttainmentSnapshot",
  "StudentCompletionOutcome",
  "ProgrammeOutcomeIndicator",
  "ProgramLearningOutcome",
  "ProgramCompetency",
  "ProgramCompetencyPlo",
  "ProgrammeProfile",
  "ProgramPolicy",
  "ProgrammeCurriculum",
  "ProgrammeCurriculumVersion",
  "ProgrammeCurriculumPathway",
  "ProgrammeCurriculumCourse",
  "ProgrammeCurriculumAuditAction",
  "ProgrammeGradingScale",
  "ProgrammeGradingScaleVersion",
  "ProgrammeGradingScaleGrade",
  "ProgrammeGradingScaleAuditAction",
  "ProgrammeCourseSpecDocumentTheme",
  "Course",
  "CourseSpec",
  "CourseSpecCourseInfo",
  "CourseSpecResponsibleLecturer",
  "CourseSpecRevisionRequest",
  "CourseSpecReviewAction",
  "CourseSpecPolicy",
  "CourseSpecTeachingLearning",
  "CourseSpecWeekProjectProgress",
  "CourseSpecSection",
  "CourseSpecClo",
  "CourseSpecCloTeachingMethod",
  "CourseSpecCloAssessmentMethod",
  "CourseSpecWeek",
  "CourseSpecAssessmentItem",
  "CourseSpecCriterionCloMapping",
  "CourseSpecMappingCell",
  "CourseSpecResource",
  "CourseSpecStudentResponsibility",
  "CourseSpecDocumentTheme",
  "CourseSpecDocumentThemeAuditEvent",
  "Offering",
  "OfferingResultAccessPolicy",
  "OfferingMeeting",
  "OfferingCoLecturer",
  "Enrollment",
  "ClassResponsibilityAssignment",
  "ClassResponsibilityAuditEvent",
  "OfferingAssessmentDeadline",
  "AssessmentResult",
  "AssessmentResultCorrection",
  "AssessmentCriterionScore",
  "AssessmentGroup",
  "AssessmentGroupMember",
  "AssessmentGroupScore",
  "AssessmentGroupCriterionScore",
  "AssessmentIndividualComponent",
  "AssessmentIndividualCriterionScore",
  "AssessmentGroupScoreCorrection",
  "AssessmentIndividualComponentCorrection",
  "AssessmentGroupAuditEvent",
  "CourseAnnouncement",
  "CourseFeedback",
  "TeachingMethod",
  "AssessmentMethod",
  "ActiveLearningCluster",
  "ActiveLearningStrategy",
  "Rubric",
  "RubricLevel",
  "RubricCriterion",
  "RubricCell",
  "QaFramework",
  "QaCriterion",
  "QaRequirement",
  "QaQualityExpectation",
  "QaExpectedEvidence",
  "QaAssessmentCycle",
  "QaRequirementAssignment",
  "QaEvidence",
  "QaEvidenceMapping",
  "QaRequirementAssessment",
  "QaEvidenceAnalysis",
  "QaEvidenceAnalysisSource",
  "QaEvidenceAnalysisReview",
  "QaDocument",
  "QaDocumentChunk",
  "QaImprovementAction",
  "QaImprovementActionFollowUp",
  "QaSarSection",
  "QaSarSubmission",
  "QaSarReview",
  "QaSarRelease",
  "QaSarBookNarrativeSection",
  "QaSarBookSectionRevision",
  "QaSarBookSectionAssignment",
  "QaSarBookTerminology",
  "QaSarBookSectionEvidenceReference",
  "QaSarBookEvidencePresentation",
  "QaSarBookSectionReview",
  "QaSarBookRequirementRatingRevision",
  "QaSarBookCriterionRatingRevision",
  "QaSarBookPart3Association",
  "QaEvaluationScenario",
  "QaEvaluationScenarioEvidence",
  "QaEvaluationRun",
  "QaEvaluationRunEvidence",
  "QaEvaluationHumanRating",
  "ActionResearchProject",
  "ActionResearchCycle",
  "ActionResearchAssignment",
  "ActionResearchProtocol",
  "ActionResearchProtocolReview",
  "ActionResearchBaselineLock",
  "ActionResearchAuditEvent",
  "CopCommunity",
  "CopMembership",
  "CopDiscussion",
  "CopComment",
  "CopAction",
] as const;

const EXPECTED_ATTENDANCE_TABLES = [
  "AttendanceSession",
  "AttendanceRecord",
  "AttendancePermissionPending",
  "AttendanceCheckpoint",
  "LecturerArrivalConfirmation",
  "ClassSessionStatus",
  "TeachingSessionOccurrence",
  "TeachingSessionDelivery",
  "TeachingSessionDeliveryAuditEvent",
  "TeachingLeaveRequest",
  "TeachingLeaveRequestOccurrence",
  "TeachingLeaveAuditEvent",
] as const;

const EXPECTED_TELEGRAM_SECURITY_TABLES = [
  "TelegramInitVerification",
  "TelegramIdentity",
  "TelegramAuditEvent",
  "TelegramNotificationPreference",
  "TelegramNotificationDelivery",
  "TelegramDestination",
  "TelegramDestinationRegistration",
  "TelegramDestinationDelivery",
] as const;

const EXPECTED_QA_SECURITY_TABLES = [
  "QaEvidenceSnapshot",
  "QaEvidenceExternalReference",
] as const;

const EXPECTED_CURRICULUM_ARTIFACT_TABLES = [
  "CourseSnapshot",
  "DeclaredTotals",
  "ImportSource",
] as const;

const EXPECTED_COURSE_SPEC_GOVERNANCE_TABLES = [
  "CourseSpecPeriodicReview",
] as const;

const EXPECTED_PUBLIC_ANALYTICS_TABLES = [
  "PublicQuestionEvent",
  "PublicQuestionSuggestion",
] as const;

const EXPECTED_STUDENT_HANDBOOK_TABLES = [
  "StudentHandbook",
  "StudentHandbookSection",
  "StudentHandbookBlock",
  "StudentHandbookAuditEvent",
] as const;

const EXPECTED_LECTURER_PORTFOLIO_TABLES = [
  "LecturerPortfolioItem",
  "LecturerPortfolioVerification",
] as const;

const FORBIDDEN_GRANTEES = new Set([
  "PUBLIC",
  "anon",
  "authenticated",
  "service_role",
]);

const PROTECTED_SCHEMAS = [
  "pms_attendance",
  "telegram_security",
  "qa_security",
  "curriculum_artifact",
  "course_spec_governance",
  "public_analytics",
  "student_handbook",
  "lecturer_portfolio",
] as const;

const ALL_VERIFIED_SCHEMAS = ["public", ...PROTECTED_SCHEMAS] as const;

type TableRow = {
  schema_name: string;
  table_name: string;
  rls_enabled: boolean;
};

type GrantRow = {
  schema_name: string;
  object_name: string;
  grantee: string;
  privilege_type: string;
};

type DefaultGrantRow = {
  schema_name: string;
  object_type: string;
  grantee: string;
  privilege_type: string;
};

function compareInventory(
  label: string,
  expected: readonly string[],
  actual: string[],
): string[] {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const errors: string[] = [];

  for (const table of actual) {
    if (!expectedSet.has(table as never)) {
      errors.push(`${label}: unclassified table ${table}`);
    }
  }
  for (const table of expected) {
    if (!actualSet.has(table)) {
      errors.push(`${label}: expected table ${table} is missing`);
    }
  }
  return errors;
}

async function main() {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = ANY(${ALL_VERIFIED_SCHEMAS}::text[])
    ORDER BY n.nspname, c.relname
  `;

  const expectedBySchema = new Map<string, readonly string[]>([
    ["public", EXPECTED_PUBLIC_TABLES],
    ["pms_attendance", EXPECTED_ATTENDANCE_TABLES],
    ["telegram_security", EXPECTED_TELEGRAM_SECURITY_TABLES],
    ["qa_security", EXPECTED_QA_SECURITY_TABLES],
    ["curriculum_artifact", EXPECTED_CURRICULUM_ARTIFACT_TABLES],
    ["course_spec_governance", EXPECTED_COURSE_SPEC_GOVERNANCE_TABLES],
    ["public_analytics", EXPECTED_PUBLIC_ANALYTICS_TABLES],
    ["student_handbook", EXPECTED_STUDENT_HANDBOOK_TABLES],
    ["lecturer_portfolio", EXPECTED_LECTURER_PORTFOLIO_TABLES],
  ]);

  const errors: string[] = [];
  for (const [schema, expected] of expectedBySchema.entries()) {
    const schemaRows = tables.filter((row) => row.schema_name === schema);
    errors.push(...compareInventory(schema, expected, schemaRows.map((row) => row.table_name)));
    if (schema !== "public") {
      for (const row of schemaRows) {
        if (!row.rls_enabled) errors.push(`${schema}.${row.table_name}: RLS is not enabled`);
      }
    }
  }

  const grants = await prisma.$queryRaw<GrantRow[]>`
    SELECT table_schema AS schema_name,
           table_name AS object_name,
           grantee,
           privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = ANY(${ALL_VERIFIED_SCHEMAS}::text[])
      AND grantee = ANY(${[...FORBIDDEN_GRANTEES]}::text[])
    ORDER BY table_schema, table_name, grantee, privilege_type
  `;
  for (const grant of grants) {
    errors.push(
      `${grant.schema_name}.${grant.object_name}: forbidden ${grant.privilege_type} grant to ${grant.grantee}`,
    );
  }

  const defaults = await prisma.$queryRaw<DefaultGrantRow[]>`
    SELECT n.nspname AS schema_name,
           CASE d.defaclobjtype
             WHEN 'r' THEN 'table'
             WHEN 'S' THEN 'sequence'
             WHEN 'f' THEN 'function'
             WHEN 'T' THEN 'type'
             WHEN 'n' THEN 'schema'
             ELSE d.defaclobjtype::text
           END AS object_type,
           r.rolname AS grantee,
           privilege_type
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
    JOIN pg_roles r ON r.oid = acl.grantee
    CROSS JOIN LATERAL (
      SELECT CASE acl.privilege_type
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        WHEN 'D' THEN 'TRUNCATE'
        WHEN 'x' THEN 'REFERENCES'
        WHEN 't' THEN 'TRIGGER'
        WHEN 'U' THEN 'USAGE'
        WHEN 'X' THEN 'EXECUTE'
        WHEN 'C' THEN 'CREATE'
        WHEN 'c' THEN 'CONNECT'
        WHEN 'T' THEN 'TEMPORARY'
        ELSE acl.privilege_type::text
      END AS privilege_type
    ) privilege
    WHERE n.nspname = ANY(${PROTECTED_SCHEMAS}::text[])
      AND r.rolname = ANY(${[...FORBIDDEN_GRANTEES]}::text[])
    ORDER BY n.nspname, object_type, grantee, privilege_type
  `;
  for (const grant of defaults) {
    errors.push(
      `${grant.schema_name}: forbidden default ${grant.privilege_type} grant on ${grant.object_type} to ${grant.grantee}`,
    );
  }

  if (errors.length > 0) {
    console.error("Database security verification failed:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
  } else {
    console.log("Database security verification passed.");
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
