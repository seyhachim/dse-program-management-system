-- Issue #347: immutable QA evidence snapshots and secure external assessor references.
-- Additive only: existing QaEvidence, mappings, analyses, SAR submissions, and SAR releases are unchanged.

CREATE TABLE "QaEvidenceSnapshot" (
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

CREATE UNIQUE INDEX "QaEvidenceSnapshot_referenceCode_key"
  ON "QaEvidenceSnapshot"("referenceCode");
CREATE INDEX "QaEvidenceSnapshot_programmeId_cycleId_idx"
  ON "QaEvidenceSnapshot"("programmeId", "cycleId");
CREATE INDEX "QaEvidenceSnapshot_evidenceId_idx"
  ON "QaEvidenceSnapshot"("evidenceId");
CREATE INDEX "QaEvidenceSnapshot_sourceEntityType_sourceEntityId_idx"
  ON "QaEvidenceSnapshot"("sourceEntityType", "sourceEntityId");
CREATE INDEX "QaEvidenceSnapshot_contentHash_idx"
  ON "QaEvidenceSnapshot"("contentHash");
CREATE UNIQUE INDEX "QaEvidenceSnapshot_cycle_evidence_hash_key"
  ON "QaEvidenceSnapshot"("cycleId", "evidenceId", "contentHash")
  WHERE "evidenceId" IS NOT NULL;

ALTER TABLE "QaEvidenceSnapshot"
  ADD CONSTRAINT "QaEvidenceSnapshot_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceSnapshot"
  ADD CONSTRAINT "QaEvidenceSnapshot_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceSnapshot"
  ADD CONSTRAINT "QaEvidenceSnapshot_evidenceId_fkey"
  FOREIGN KEY ("evidenceId") REFERENCES "QaEvidence"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceSnapshot"
  ADD CONSTRAINT "QaEvidenceSnapshot_capturedById_fkey"
  FOREIGN KEY ("capturedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "QaEvidenceExternalReference" (
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

CREATE UNIQUE INDEX "QaEvidenceExternalReference_tokenHash_key"
  ON "QaEvidenceExternalReference"("tokenHash");
CREATE INDEX "QaEvidenceExternalReference_snapshotId_idx"
  ON "QaEvidenceExternalReference"("snapshotId");
CREATE INDEX "QaEvidenceExternalReference_active_expiresAt_idx"
  ON "QaEvidenceExternalReference"("active", "expiresAt");

ALTER TABLE "QaEvidenceExternalReference"
  ADD CONSTRAINT "QaEvidenceExternalReference_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "QaEvidenceSnapshot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceExternalReference"
  ADD CONSTRAINT "QaEvidenceExternalReference_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Evidence snapshots are academic/audit records. Corrections are represented by
-- a new snapshot, never by rewriting or deleting a captured snapshot.
CREATE OR REPLACE FUNCTION "reject_qa_evidence_snapshot_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'QA evidence snapshots are immutable; capture a new snapshot instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "QaEvidenceSnapshot_reject_update"
BEFORE UPDATE ON "QaEvidenceSnapshot"
FOR EACH ROW EXECUTE FUNCTION "reject_qa_evidence_snapshot_mutation"();

CREATE TRIGGER "QaEvidenceSnapshot_reject_delete"
BEFORE DELETE ON "QaEvidenceSnapshot"
FOR EACH ROW EXECUTE FUNCTION "reject_qa_evidence_snapshot_mutation"();

-- Backend-only evidence-sharing tables. No permissive Supabase Data API policies
-- are created; the repository verifier classifies them and requires RLS.
ALTER TABLE "QaEvidenceSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaEvidenceExternalReference" ENABLE ROW LEVEL SECURITY;
