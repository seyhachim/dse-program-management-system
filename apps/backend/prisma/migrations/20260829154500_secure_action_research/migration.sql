-- Action Research security hardening for phases 1-3 (#721 #722 #723).
-- These records are backend-owned research/governance data. Supabase Data API roles
-- must not receive direct table access; application authorization remains in the backend.

ALTER TABLE "ActionResearchProject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionResearchCycle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionResearchAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionResearchProtocol" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionResearchProtocolReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionResearchBaselineLock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionResearchAuditEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "ActionResearchProject" FROM PUBLIC;
REVOKE ALL ON TABLE "ActionResearchCycle" FROM PUBLIC;
REVOKE ALL ON TABLE "ActionResearchAssignment" FROM PUBLIC;
REVOKE ALL ON TABLE "ActionResearchProtocol" FROM PUBLIC;
REVOKE ALL ON TABLE "ActionResearchProtocolReview" FROM PUBLIC;
REVOKE ALL ON TABLE "ActionResearchBaselineLock" FROM PUBLIC;
REVOKE ALL ON TABLE "ActionResearchAuditEvent" FROM PUBLIC;

DO $$
DECLARE
  role_name TEXT;
  table_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH table_name IN ARRAY ARRAY[
        'ActionResearchProject',
        'ActionResearchCycle',
        'ActionResearchAssignment',
        'ActionResearchProtocol',
        'ActionResearchProtocolReview',
        'ActionResearchBaselineLock',
        'ActionResearchAuditEvent'
      ]
      LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', table_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
