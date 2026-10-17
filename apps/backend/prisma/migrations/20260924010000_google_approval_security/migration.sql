-- #1140 (rebased after #1143): SQL-managed security-only schema. Intentionally outside Prisma's public
-- schema models so these operator identity-proofing records are not surfaced by
-- generated Data API/Prisma model CRUD. Application access uses bound raw SQL.
-- Some hosted runtimes use a least-privilege database role that may create
-- objects inside an existing schema but may not CREATE SCHEMA on the database.
-- CI/local roles can create it here; hosted Supabase may pre-provision the
-- schema once with a privileged migration channel, revoke Data API/Public
-- access there, and grant only USAGE/CREATE to the backend migration role.
-- Never fall back to public for these records.
DO $$
DECLARE schema_owner TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pms_auth_security') THEN
    EXECUTE 'CREATE SCHEMA pms_auth_security';
  END IF;

  SELECT pg_get_userbyid(nspowner)
    INTO schema_owner
    FROM pg_namespace
   WHERE nspname = 'pms_auth_security';

  IF schema_owner = current_user THEN
    EXECUTE 'REVOKE ALL ON SCHEMA pms_auth_security FROM PUBLIC';
  END IF;
END $$;

CREATE TABLE pms_auth_security.google_link_intent (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
  auth_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CONSTRAINT google_link_intent_expiry CHECK (expires_at > created_at)
);
CREATE INDEX google_link_intent_latest_idx
  ON pms_auth_security.google_link_intent (user_id, auth_uid, created_at DESC);

CREATE TABLE pms_auth_security.google_identity_approval_event (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
  auth_uid TEXT NOT NULL,
  google_identity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'revoked')),
  actor_user_id TEXT NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
  evidence_reference TEXT NOT NULL CHECK (length(evidence_reference) BETWEEN 8 AND 500),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 8 AND 500),
  link_intent_id TEXT REFERENCES pms_auth_security.google_link_intent(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT google_approval_intent_shape CHECK (
    (action = 'approved' AND link_intent_id IS NOT NULL) OR
    (action = 'revoked' AND link_intent_id IS NULL)
  )
);
CREATE UNIQUE INDEX google_approval_one_event_per_intent_idx
  ON pms_auth_security.google_identity_approval_event(link_intent_id)
  WHERE action = 'approved';
CREATE INDEX google_approval_latest_idx
  ON pms_auth_security.google_identity_approval_event(auth_uid, id DESC);

-- Approval decisions are immutable. A revocation is a new event, not an edit.
CREATE FUNCTION pms_auth_security.reject_google_approval_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Google approval history is append-only';
END;
$$;
CREATE TRIGGER google_approval_append_only
BEFORE UPDATE OR DELETE ON pms_auth_security.google_identity_approval_event
FOR EACH ROW EXECUTE FUNCTION pms_auth_security.reject_google_approval_event_mutation();

ALTER TABLE pms_auth_security.google_link_intent ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_auth_security.google_identity_approval_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA pms_auth_security FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA pms_auth_security FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pms_auth_security FROM PUBLIC;

-- Supabase Data API roles (when present) must never query or mutate the store.
-- A pre-provisioned hosted schema can be owned by the privileged migration
-- channel; in that case schema-level revocation/commenting is done by that
-- channel, while this runtime-owned migration still revokes its tables,
-- sequences and functions.
DO $$
DECLARE
  r TEXT;
  schema_owner TEXT;
BEGIN
  SELECT pg_get_userbyid(nspowner)
    INTO schema_owner
    FROM pg_namespace
   WHERE nspname = 'pms_auth_security';

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      IF schema_owner = current_user THEN
        EXECUTE format('REVOKE ALL ON SCHEMA pms_auth_security FROM %I', r);
      END IF;
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA pms_auth_security FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA pms_auth_security FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pms_auth_security FROM %I', r);
    END IF;
  END LOOP;

  IF schema_owner = current_user THEN
    COMMENT ON SCHEMA pms_auth_security IS
      'Restricted server-only Google identity approval history; SQL-managed, never exposed to the Data API';
  END IF;
END $$;
