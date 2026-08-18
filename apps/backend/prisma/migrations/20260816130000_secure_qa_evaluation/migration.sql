-- Issue #133 follow-up: controlled QA evaluation tables were introduced after
-- the original database-security baseline migration. Keep them on the same
-- backend-only access path as the rest of PMS application data.
--
-- This migration is intentionally additive. Do not rewrite the earlier QA
-- evaluation schema migration or the original security baseline: existing
-- databases may already have applied them. Re-applying ENABLE ROW LEVEL
-- SECURITY / REVOKE is safe.

DO $$
DECLARE
  table_name text;
  api_role text;
  qa_evaluation_tables constant text[] := ARRAY[
    'QaEvaluationScenario',
    'QaEvaluationScenarioEvidence',
    'QaEvaluationRun',
    'QaEvaluationRunEvidence',
    'QaEvaluationHumanRating'
  ];
BEGIN
  FOREACH table_name IN ARRAY qa_evaluation_tables LOOP
    IF to_regclass(format('%I.%I', 'public', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Issue #133 QA evaluation security follow-up expected public.% but it does not exist', table_name;
    END IF;

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC', 'public', table_name);
  END LOOP;

  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    FOREACH table_name IN ARRAY qa_evaluation_tables LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', 'public', table_name, api_role);
    END LOOP;
  END LOOP;
END
$$;
