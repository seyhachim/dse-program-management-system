-- Issue #133: migration-owned database security baseline.
--
-- DSE-PMS application data is backend-only. Browser clients authenticate with
-- Supabase Auth, then call the Bun API; they do not query PMS tables through the
-- Supabase Data API/PostgREST. The backend uses its direct PostgreSQL connection
-- and remains the application authorization boundary.
--
-- Historically, some RLS state was enabled manually in Supabase and therefore
-- could not be reproduced on a clean database. This migration deliberately
-- re-applies RLS to every current PMS table, removes direct Data API grants, and
-- makes future grants opt-in. Repeating ENABLE ROW LEVEL SECURITY / REVOKE is
-- safe on databases where part of this protection already exists.
--
-- Supabase-specific roles (anon/authenticated/service_role) do not exist in the
-- ordinary PostgreSQL instance used by CI, so every reference to those roles is
-- guarded through pg_roles and executed dynamically.

DO $$
DECLARE
  table_name text;
  api_role text;
  public_tables constant text[] := ARRAY[
    'User',
    'Role',
    'Programme',
    'Permission',
    'RolePermission',
    'UserRoleAssignment',
    'Student',
    'ProgramLearningOutcome',
    'ProgramCompetency',
    'ProgramCompetencyPlo',
    'ProgrammeProfile',
    'ProgramPolicy',
    'Course',
    'CourseSpec',
    'CourseSpecReviewAction',
    'CourseSpecPolicy',
    'CourseSpecTeachingLearning',
    'CourseSpecWeekProjectProgress',
    'CourseSpecSection',
    'CourseSpecClo',
    'CourseSpecCloTeachingMethod',
    'CourseSpecCloAssessmentMethod',
    'CourseSpecWeek',
    'CourseSpecAssessmentItem',
    'CourseSpecMappingCell',
    'CourseSpecResource',
    'CourseSpecStudentResponsibility',
    'Offering',
    'OfferingMeeting',
    'OfferingCoLecturer',
    'Enrollment',
    'OfferingAssessmentDeadline',
    'AssessmentResult',
    'CourseAnnouncement',
    'CourseFeedback',
    'TeachingMethod',
    'AssessmentMethod',
    'ActiveLearningCluster',
    'ActiveLearningStrategy',
    'Rubric',
    'RubricLevel',
    'RubricCriterion',
    'RubricCell',
    'QaFramework',
    'QaCriterion',
    'QaRequirement',
    'QaQualityExpectation',
    'QaExpectedEvidence',
    'QaAssessmentCycle',
    'QaRequirementAssignment',
    'QaEvidence',
    'QaEvidenceMapping',
    'QaRequirementAssessment',
    'QaEvidenceAnalysis',
    'QaEvidenceAnalysisSource',
    'QaEvidenceAnalysisReview',
    'QaDocument',
    'QaDocumentChunk',
    'QaImprovementAction',
    'QaSarSection',
    'QaSarSubmission',
    'QaSarReview',
    'QaSarRelease'
  ];
BEGIN
  FOREACH table_name IN ARRAY public_tables LOOP
    IF to_regclass(format('%I.%I', 'public', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Issue #133 security baseline expected public.% but it does not exist', table_name;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      'public', table_name
    );

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC',
      'public', table_name
    );
  END LOOP;

  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    FOREACH table_name IN ARRAY public_tables LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
        'public', table_name, api_role
      );
    END LOOP;
  END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
      api_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
      api_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
      api_role
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  api_role text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_namespace WHERE nspname = 'pms_attendance'
  ) THEN
    RAISE EXCEPTION 'Issue #133 security baseline expected schema pms_attendance but it does not exist';
  END IF;

  IF to_regclass('pms_attendance."AttendanceSession"') IS NULL
     OR to_regclass('pms_attendance."AttendanceRecord"') IS NULL THEN
    RAISE EXCEPTION 'Issue #133 security baseline expected pms_attendance attendance tables';
  END IF;

  ALTER TABLE "pms_attendance"."AttendanceSession" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "pms_attendance"."AttendanceRecord" ENABLE ROW LEVEL SECURITY;

  REVOKE ALL PRIVILEGES ON SCHEMA "pms_attendance" FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "pms_attendance" FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "pms_attendance" FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA "pms_attendance" FROM PUBLIC;

  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I',
      'pms_attendance', api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I',
      'pms_attendance', api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I',
      'pms_attendance', api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA %I FROM %I',
      'pms_attendance', api_role
    );
  END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA "pms_attendance"
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "pms_attendance"
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "pms_attendance"
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON TABLES FROM %I',
      'pms_attendance', api_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
      'pms_attendance', api_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
      'pms_attendance', api_role
    );
  END LOOP;
END
$$;
