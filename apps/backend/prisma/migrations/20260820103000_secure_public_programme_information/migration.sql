-- Issue #484 security follow-up: public programme-information rows are managed by
-- the PMS backend. Public HTTP/Telegram reads will be exposed by an application
-- service in later issues; Supabase Data API roles must not receive direct table
-- access. Keep these tables on the same backend-only path as existing PMS data.

DO $$
DECLARE
  table_name text;
  api_role text;
  public_info_tables constant text[] := ARRAY[
    'ProgrammeFaq',
    'ProgrammeImportantDate',
    'ProgrammePublicProfile'
  ];
BEGIN
  FOREACH table_name IN ARRAY public_info_tables LOOP
    IF to_regclass(format('%I.%I', 'public', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Issue #484 public-programme security follow-up expected public.% but it does not exist', table_name;
    END IF;

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC', 'public', table_name);
  END LOOP;

  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    FOREACH table_name IN ARRAY public_info_tables LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', 'public', table_name, api_role);
    END LOOP;
  END LOOP;
END
$$;
