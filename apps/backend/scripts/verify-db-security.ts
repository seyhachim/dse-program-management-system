import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXPECTED_PUBLIC_TABLES = [
  "User",
  "LecturerProfile",
  "Role",
  "Programme",
  "ProgrammeFaq",
  "ProgrammeImportantDate",
  "ProgrammePublicProfile",
  "Permission",
  "RolePermission",
  "UserRoleAssignment",
  "Student",
  "StudentProfile",
  "StudentPortfolioProfile",
  "StudentPortfolioEvidence",
  "StudentPortfolioEvidenceLink",
  "StudentCohort",
  "StudentCohortMembership",
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
  "QaEvaluationScenario",
  "QaEvaluationScenarioEvidence",
  "QaEvaluationRun",
  "QaEvaluationRunEvidence",
  "QaEvaluationHumanRating",
  "CopCommunity",
  "CopMembership",
  "CopDiscussion",
  "CopComment",
  "CopAction",
] as const;

const EXPECTED_TABLES = {
  public: EXPECTED_PUBLIC_TABLES,
  pms_attendance: [
    "AttendanceSession",
    "AttendanceRecord",
    "AttendancePermissionPending",
    "LecturerArrivalConfirmation",
    "ClassSessionStatus",
  ],
  telegram_security: [
    "TelegramInitVerification",
    "TelegramIdentity",
    "TelegramAuditEvent",
    "TelegramNotificationPreference",
    "TelegramNotificationDelivery",
  ],
  qa_security: ["QaEvidenceSnapshot", "QaEvidenceExternalReference"],
  curriculum_artifact: ["CourseSnapshot", "DeclaredTotals", "ImportSource"],
  course_spec_governance: ["CourseSpecPeriodicReview"],
  public_analytics: ["PublicQuestionEvent", "PublicQuestionSuggestion"],
  lecturer_portfolio: ["LecturerPortfolioItem", "LecturerPortfolioVerification"],
} as const;

const FORBIDDEN_GRANTEES = new Set(["PUBLIC", "anon", "authenticated", "service_role"]);
const PROTECTED_SCHEMAS = Object.keys(EXPECTED_TABLES).filter((schema) => schema !== "public");
const ALL_VERIFIED_SCHEMAS = Object.keys(EXPECTED_TABLES);

type TableRow = { schema_name: string; table_name: string; rls_enabled: boolean };
type GrantRow = { schema_name: string; object_name: string; grantee: string; privilege_type: string };
type DefaultGrantRow = { schema_name: string; object_type: string; grantee: string; privilege_type: string };

function compareInventory(label: string, expected: readonly string[], actual: string[]): string[] {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const errors: string[] = [];
  const missing = [...expectedSet].filter((name) => !actualSet.has(name)).sort();
  const unexpected = [...actualSet].filter((name) => !expectedSet.has(name)).sort();
  if (missing.length > 0) errors.push(`${label}: missing expected tables: ${missing.join(", ")}`);
  if (unexpected.length > 0) errors.push(`${label}: unclassified tables: ${unexpected.join(", ")}`);
  return errors;
}

async function tablesForSchema(schemaName: string): Promise<TableRow[]> {
  return prisma.$queryRawUnsafe<TableRow[]>(
    `
      SELECT n.nspname::text AS schema_name,
             c.relname::text AS table_name,
             c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relkind IN ('r', 'p')
        AND c.relname <> '_prisma_migrations'
      ORDER BY c.relname
    `,
    schemaName,
  );
}

async function main(): Promise<void> {
  const errors: string[] = [];
  const entries = await Promise.all(
    Object.entries(EXPECTED_TABLES).map(async ([schemaName, expected]) => ({
      schemaName,
      expected,
      tables: await tablesForSchema(schemaName),
    })),
  );

  for (const { schemaName, expected, tables } of entries) {
    errors.push(...compareInventory(`${schemaName} schema`, expected, tables.map((table) => table.table_name)));
    for (const table of tables) {
      if (!table.rls_enabled) errors.push(`RLS disabled: ${table.schema_name}.${table.table_name}`);
    }
  }

  const schemaSql = ALL_VERIFIED_SCHEMAS.map((schema) => `'${schema}'`).join(", ");
  const protectedSchemaSql = PROTECTED_SCHEMAS.map((schema) => `'${schema}'`).join(", ");

  const tableGrants = await prisma.$queryRawUnsafe<GrantRow[]>(`
    SELECT n.nspname::text AS schema_name,
           c.relname::text AS object_name,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE r.rolname::text END AS grantee,
           acl.privilege_type::text AS privilege_type
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS acl
    LEFT JOIN pg_roles r ON r.oid = acl.grantee
    WHERE n.nspname IN (${schemaSql})
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
      AND (acl.grantee = 0 OR r.rolname IN ('anon', 'authenticated', 'service_role'))
    ORDER BY n.nspname, c.relname, grantee, acl.privilege_type
  `);
  for (const grant of tableGrants) {
    if (FORBIDDEN_GRANTEES.has(grant.grantee)) {
      errors.push(`Forbidden table grant: ${grant.grantee} has ${grant.privilege_type} on ${grant.schema_name}.${grant.object_name}`);
    }
  }

  const schemaGrants = await prisma.$queryRawUnsafe<GrantRow[]>(`
    SELECT n.nspname::text AS schema_name,
           n.nspname::text AS object_name,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE r.rolname::text END AS grantee,
           acl.privilege_type::text AS privilege_type
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) AS acl
    LEFT JOIN pg_roles r ON r.oid = acl.grantee
    WHERE n.nspname IN (${protectedSchemaSql})
      AND (acl.grantee = 0 OR r.rolname IN ('anon', 'authenticated', 'service_role'))
    ORDER BY n.nspname, grantee, acl.privilege_type
  `);
  for (const grant of schemaGrants) {
    if (FORBIDDEN_GRANTEES.has(grant.grantee)) {
      errors.push(`Forbidden schema grant: ${grant.grantee} has ${grant.privilege_type} on ${grant.schema_name}`);
    }
  }

  const defaultGrants = await prisma.$queryRawUnsafe<DefaultGrantRow[]>(`
    SELECT n.nspname::text AS schema_name,
           CASE d.defaclobjtype
             WHEN 'r' THEN 'table'
             WHEN 'S' THEN 'sequence'
             WHEN 'f' THEN 'function'
             ELSE d.defaclobjtype::text
           END AS object_type,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE r.rolname::text END AS grantee,
           acl.privilege_type::text AS privilege_type
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    JOIN pg_roles owner_role ON owner_role.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
    LEFT JOIN pg_roles r ON r.oid = acl.grantee
    WHERE n.nspname IN (${schemaSql})
      AND owner_role.rolname = current_user
      AND (acl.grantee = 0 OR r.rolname IN ('anon', 'authenticated', 'service_role'))
    ORDER BY n.nspname, object_type, grantee, acl.privilege_type
  `);
  for (const grant of defaultGrants) {
    if (FORBIDDEN_GRANTEES.has(grant.grantee)) {
      errors.push(`Forbidden default grant: future ${grant.schema_name} ${grant.object_type}s grant ${grant.privilege_type} to ${grant.grantee}`);
    }
  }

  if (errors.length > 0) {
    console.error("Database security verification failed:\n");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  const summary = entries.map(({ schemaName, tables }) => `${tables.length} ${schemaName} tables`).join(", ");
  console.log(`Database security verified: ${summary} are classified, RLS-protected, and not granted to Data API roles.`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
