-- Issue #308: reproducible structured deterministic reasoning snapshot.
ALTER TABLE "QaEvidenceAnalysis"
  ADD COLUMN "reasoningFactors" JSONB NOT NULL DEFAULT '{"evidence":[],"relationships":[]}'::jsonb;
