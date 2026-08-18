-- PR #289: optional per-offering survey gate for provisional PMS results.
-- This table is backend-only policy state. It must never expose marks or survey
-- content and follows the fail-closed database security baseline introduced by #133.

CREATE TABLE "OfferingResultAccessPolicy" (
  "offeringId" TEXT NOT NULL,
  "requireSurveyBeforeResults" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfferingResultAccessPolicy_pkey" PRIMARY KEY ("offeringId")
);

ALTER TABLE "OfferingResultAccessPolicy"
  ADD CONSTRAINT "OfferingResultAccessPolicy_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "Offering"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfferingResultAccessPolicy" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "OfferingResultAccessPolicy" FROM PUBLIC;

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
      'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
      'public', 'OfferingResultAccessPolicy', api_role
    );
  END LOOP;
END
$$;
