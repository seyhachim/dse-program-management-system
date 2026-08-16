-- Issue #133 follow-up: Telegram init-data replay protection introduced a
-- backend-only table in a dedicated schema after the original database-security
-- baseline. Protect the schema and table without rewriting the already-landed
-- Telegram migration.

DO $$
DECLARE
  api_role text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_namespace WHERE nspname = 'telegram_security'
  ) THEN
    RAISE EXCEPTION 'Issue #133 Telegram security follow-up expected schema telegram_security but it does not exist';
  END IF;

  IF to_regclass('telegram_security."TelegramInitVerification"') IS NULL THEN
    RAISE EXCEPTION 'Issue #133 Telegram security follow-up expected telegram_security.TelegramInitVerification';
  END IF;

  ALTER TABLE "telegram_security"."TelegramInitVerification" ENABLE ROW LEVEL SECURITY;

  REVOKE ALL PRIVILEGES ON SCHEMA "telegram_security" FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "telegram_security" FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "telegram_security" FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA "telegram_security" FROM PUBLIC;

  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I',
      'telegram_security', api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I',
      'telegram_security', api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I',
      'telegram_security', api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA %I FROM %I',
      'telegram_security', api_role
    );
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
      'telegram_security', api_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
      'telegram_security', api_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
      'telegram_security', api_role
    );
  END LOOP;
END
$$;
