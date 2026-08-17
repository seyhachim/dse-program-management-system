-- Issue #347: immutable QA evidence snapshots and secure external assessor references.
-- These records intentionally live outside Prisma's managed public schema, like
-- the existing attendance/Telegram security domains. Backend services use
-- parameterized SQL and the repository verifier enforces fail-closed RLS/grants.

CREATE SCHEMA IF NOT EXISTS qa_security;
REVOKE ALL ON SCHEMA qa_security FROM PUBLIC;

CREATE TABLE qa_security."QaEvidenceSnapshot" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "evidenceId" TEXT,
  "referenceCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "sourceDomain" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceEntityId" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL DEFAULT '',
  "snapshot" JSONB NOT NULL,
  "scope" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "reportingPeriod" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "provenance" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "contentHash" TEXT NOT NULL,
  "redactionPolicyVersion" TEXT NOT NULL DEFAULT 'qa-external-v1',
  "capturedById" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaEvidenceSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QaEvidenceSnapshot_referenceCode_not_blank" CHECK (length(btrim("referenceCode")) > 0),
  CONSTRAINT "QaEvidenceSnapshot_contentHash_not_blank" CHECK (length(btrim("contentHash")) > 0)
);

CREATE UNIQUE INDEX "QaEvidenceSnapshot_referenceCode_key" ON qa_security."QaEvidenceSnapshot"("referenceCode");
CREATE INDEX "QaEvidenceSnapshot_programmeId_cycleId_idx" ON qa_security."QaEvidenceSnapshot"("programmeId", "cycleId");
CREATE INDEX "QaEvidenceSnapshot_evidenceId_idx" ON qa_security."QaEvidenceSnapshot"("evidenceId");
CREATE INDEX "QaEvidenceSnapshot_sourceEntityType_sourceEntityId_idx" ON qa_security."QaEvidenceSnapshot"("sourceEntityType", "sourceEntityId");
CREATE INDEX "QaEvidenceSnapshot_contentHash_idx" ON qa_security."QaEvidenceSnapshot"("contentHash");
CREATE UNIQUE INDEX "QaEvidenceSnapshot_cycle_evidence_hash_key"
  ON qa_security."QaEvidenceSnapshot"("cycleId", "evidenceId", "contentHash") WHERE "evidenceId" IS NOT NULL;

ALTER TABLE qa_security."QaEvidenceSnapshot" ADD CONSTRAINT "QaEvidenceSnapshot_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES public."Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE qa_security."QaEvidenceSnapshot" ADD CONSTRAINT "QaEvidenceSnapshot_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES public."QaAssessmentCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE qa_security."QaEvidenceSnapshot" ADD CONSTRAINT "QaEvidenceSnapshot_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES public."QaEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE qa_security."QaEvidenceSnapshot" ADD CONSTRAINT "QaEvidenceSnapshot_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE qa_security."QaEvidenceExternalReference" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastViewedAt" TIMESTAMP(3),
  CONSTRAINT "QaEvidenceExternalReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QaEvidenceExternalReference_tokenHash_key" ON qa_security."QaEvidenceExternalReference"("tokenHash");
CREATE INDEX "QaEvidenceExternalReference_snapshotId_idx" ON qa_security."QaEvidenceExternalReference"("snapshotId");
CREATE INDEX "QaEvidenceExternalReference_active_expiresAt_idx" ON qa_security."QaEvidenceExternalReference"("active", "expiresAt");
ALTER TABLE qa_security."QaEvidenceExternalReference" ADD CONSTRAINT "QaEvidenceExternalReference_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES qa_security."QaEvidenceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE qa_security."QaEvidenceExternalReference" ADD CONSTRAINT "QaEvidenceExternalReference_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION qa_security.reject_qa_evidence_snapshot_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'QA evidence snapshots are immutable; capture a new snapshot instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "QaEvidenceSnapshot_reject_update" BEFORE UPDATE ON qa_security."QaEvidenceSnapshot" FOR EACH ROW EXECUTE FUNCTION qa_security.reject_qa_evidence_snapshot_mutation();
CREATE TRIGGER "QaEvidenceSnapshot_reject_delete" BEFORE DELETE ON qa_security."QaEvidenceSnapshot" FOR EACH ROW EXECUTE FUNCTION qa_security.reject_qa_evidence_snapshot_mutation();

ALTER TABLE qa_security."QaEvidenceSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_security."QaEvidenceExternalReference" ENABLE ROW LEVEL SECURITY;

-- Backend compatibility views keep raw SQL call sites simple while the protected
-- base tables remain outside Prisma's managed public-table schema. No Data API
-- role receives privileges on these views.
CREATE VIEW public."QaEvidenceSnapshot" WITH (security_invoker = true) AS
  SELECT * FROM qa_security."QaEvidenceSnapshot";
CREATE VIEW public."QaEvidenceExternalReference" WITH (security_invoker = true) AS
  SELECT * FROM qa_security."QaEvidenceExternalReference";
REVOKE ALL ON public."QaEvidenceSnapshot" FROM PUBLIC;
REVOKE ALL ON public."QaEvidenceExternalReference" FROM PUBLIC;

DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA qa_security FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA qa_security FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA qa_security FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON TABLE public."QaEvidenceSnapshot" FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON TABLE public."QaEvidenceExternalReference" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
