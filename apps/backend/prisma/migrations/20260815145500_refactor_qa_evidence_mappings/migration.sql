-- Issue #228: make QA evidence reusable across AUN-QA requirements.
-- Existing evidence rows are preserved in place. Their old cycle/requirement
-- ownership is losslessly copied into QaEvidenceMapping before those ownership
-- columns are removed from QaEvidence.

CREATE TABLE "QaEvidenceMapping" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "expectationId" TEXT,
  "relevanceNote" TEXT NOT NULL DEFAULT '',
  "mappedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaEvidenceMapping_pkey" PRIMARY KEY ("id")
);

-- Preserve every legacy requirement-owned evidence relationship exactly once.
INSERT INTO "QaEvidenceMapping" (
  "id",
  "programmeId",
  "cycleId",
  "evidenceId",
  "requirementId",
  "expectationId",
  "relevanceNote",
  "mappedById",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-map:' || e.id,
  e."programmeId",
  e."cycleId",
  e.id,
  e."requirementId",
  NULL,
  '',
  e."createdById",
  e."createdAt",
  e."updatedAt"
FROM "QaEvidence" e;

CREATE UNIQUE INDEX "QaEvidenceMapping_cycleId_evidenceId_requirementId_key"
  ON "QaEvidenceMapping"("cycleId", "evidenceId", "requirementId");
CREATE INDEX "QaEvidenceMapping_programmeId_cycleId_idx"
  ON "QaEvidenceMapping"("programmeId", "cycleId");
CREATE INDEX "QaEvidenceMapping_requirementId_idx"
  ON "QaEvidenceMapping"("requirementId");
CREATE INDEX "QaEvidenceMapping_evidenceId_idx"
  ON "QaEvidenceMapping"("evidenceId");
CREATE INDEX "QaEvidenceMapping_expectationId_idx"
  ON "QaEvidenceMapping"("expectationId");
CREATE INDEX "QaEvidenceMapping_mappedById_idx"
  ON "QaEvidenceMapping"("mappedById");

ALTER TABLE "QaEvidenceMapping"
  ADD CONSTRAINT "QaEvidenceMapping_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceMapping"
  ADD CONSTRAINT "QaEvidenceMapping_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceMapping"
  ADD CONSTRAINT "QaEvidenceMapping_evidenceId_fkey"
  FOREIGN KEY ("evidenceId") REFERENCES "QaEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceMapping"
  ADD CONSTRAINT "QaEvidenceMapping_requirementId_fkey"
  FOREIGN KEY ("requirementId") REFERENCES "QaRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceMapping"
  ADD CONSTRAINT "QaEvidenceMapping_expectationId_fkey"
  FOREIGN KEY ("expectationId") REFERENCES "QaQualityExpectation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceMapping"
  ADD CONSTRAINT "QaEvidenceMapping_mappedById_fkey"
  FOREIGN KEY ("mappedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QaEvidenceMapping" ENABLE ROW LEVEL SECURITY;

-- QaEvidence is now the canonical programme evidence item. Cycle/requirement
-- applicability belongs to mappings, so the same item can support many requirements.
ALTER TABLE "QaEvidence" DROP CONSTRAINT IF EXISTS "QaEvidence_cycleId_fkey";
ALTER TABLE "QaEvidence" DROP CONSTRAINT IF EXISTS "QaEvidence_requirementId_fkey";
DROP INDEX IF EXISTS "QaEvidence_programmeId_cycleId_idx";
DROP INDEX IF EXISTS "QaEvidence_requirementId_idx";
ALTER TABLE "QaEvidence" DROP COLUMN "cycleId";
ALTER TABLE "QaEvidence" DROP COLUMN "requirementId";
CREATE INDEX "QaEvidence_programmeId_idx" ON "QaEvidence"("programmeId");
