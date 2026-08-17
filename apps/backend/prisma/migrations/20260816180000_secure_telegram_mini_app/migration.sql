-- Issues #268-#275 / #133 follow-up: all Telegram Mini App security state is
-- backend-only. Explicitly RLS-protect the new tables and revoke direct Data API
-- access without weakening the fail-closed database verifier.

DO $$
DECLARE
  api_role text;
  table_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_namespace WHERE nspname = 'telegram_security'
  ) THEN
    RAISE EXCEPTION 'Telegram Mini App security expected schema telegram_security';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'TelegramIdentity',
    'TelegramAuditEvent',
    'TelegramNotificationPreference',
    'TelegramNotificationDelivery'
  ]
  LOOP
    IF to_regclass(format('telegram_security.%I', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Telegram Mini App security expected table telegram_security.%', table_name;
    END IF;
    EXECUTE format('ALTER TABLE telegram_security.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;

  REVOKE ALL PRIVILEGES ON SCHEMA "telegram_security" FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "telegram_security" FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "telegram_security" FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA "telegram_security" FROM PUBLIC;

  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I', 'telegram_security', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I', 'telegram_security', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I', 'telegram_security', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA %I FROM %I', 'telegram_security', api_role);
  END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA "telegram_security"
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "telegram_security"
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "telegram_security"
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON TABLES FROM %I', 'telegram_security', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I', 'telegram_security', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I', 'telegram_security', api_role);
  END LOOP;
END
$$;
