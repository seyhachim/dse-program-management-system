-- Issue #133 follow-up: Community of Practice tables were introduced after the
-- original database-security baseline migration. Keep these tables on the same
-- backend-only access path as the rest of PMS application data.
--
-- The migration is intentionally additive. Do not rewrite the earlier CoP schema
-- migration or the original security baseline: existing databases may already
-- have applied both. Re-applying ENABLE ROW LEVEL SECURITY / REVOKE is safe.

DO $$
DECLARE
  table_name text;
  api_role text;
  cop_tables constant text[] := ARRAY[
    'CopCommunity',
    'CopMembership',
    'CopDiscussion',
    'CopComment',
    'CopAction'
  ];
BEGIN
  FOREACH table_name IN ARRAY cop_tables LOOP
    IF to_regclass(format('%I.%I', 'public', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Issue #133 CoP security follow-up expected public.% but it does not exist', table_name;
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
    FOREACH table_name IN ARRAY cop_tables LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
        'public', table_name, api_role
      );
    END LOOP;
  END LOOP;
END
$$;
