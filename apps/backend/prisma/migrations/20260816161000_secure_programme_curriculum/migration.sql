-- Issue #133 follow-up: programme curriculum/versioning tables were introduced
-- after the original database-security baseline migration. Keep these academic
-- history tables on the same backend-only access path as the rest of PMS data.
--
-- This migration is intentionally additive and comes after the curriculum schema
-- and immutability migrations. Do not rewrite already-applied curriculum or
-- security migrations.

DO $$
DECLARE
  table_name text;
  api_role text;
  curriculum_tables constant text[] := ARRAY[
    'ProgrammeCurriculum',
    'ProgrammeCurriculumVersion',
    'ProgrammeCurriculumCourse',
    'ProgrammeCurriculumAuditAction'
  ];
BEGIN
  FOREACH table_name IN ARRAY curriculum_tables LOOP
    IF to_regclass(format('%I.%I', 'public', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Issue #133 curriculum security follow-up expected public.% but it does not exist', table_name;
    END IF;

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC', 'public', table_name);
  END LOOP;

  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    FOREACH table_name IN ARRAY curriculum_tables LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', 'public', table_name, api_role);
    END LOOP;
  END LOOP;
END
$$;
