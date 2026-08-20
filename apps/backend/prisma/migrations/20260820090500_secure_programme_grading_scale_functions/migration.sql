-- Issue #457 hardening: the grading-scale helper/trigger functions are internal
-- database implementation details. Supabase Data API roles must not execute them
-- directly even when an installation has broad default FUNCTION grants.

REVOKE ALL PRIVILEGES ON FUNCTION "ensure_dse_baseline_grading_scale"(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "seed_dse_grading_scale_after_programme_insert"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "check_programme_grading_scale_predecessor"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "protect_immutable_programme_grading_scale_version"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "protect_programme_grading_scale_grade"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "protect_programme_grading_scale_audit_history"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "protect_course_spec_grading_scale_binding"() FROM PUBLIC;

DO $$
DECLARE
  api_role TEXT;
BEGIN
  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I(TEXT, TEXT) FROM %I',
      'ensure_dse_baseline_grading_scale',
      api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I() FROM %I',
      'seed_dse_grading_scale_after_programme_insert',
      api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I() FROM %I',
      'check_programme_grading_scale_predecessor',
      api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I() FROM %I',
      'protect_immutable_programme_grading_scale_version',
      api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I() FROM %I',
      'protect_programme_grading_scale_grade',
      api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I() FROM %I',
      'protect_programme_grading_scale_audit_history',
      api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I() FROM %I',
      'protect_course_spec_grading_scale_binding',
      api_role
    );
  END LOOP;
END
$$;
