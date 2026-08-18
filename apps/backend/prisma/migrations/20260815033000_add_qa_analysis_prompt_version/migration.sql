-- Issue #190: make the prompt version of AI-assisted QA analyses auditable.
ALTER TABLE "QaEvidenceAnalysis"
  ADD COLUMN "promptVersion" TEXT NOT NULL DEFAULT '';

CREATE INDEX "QaEvidenceAnalysis_engine_promptVersion_idx"
  ON "QaEvidenceAnalysis"("engine", "promptVersion");
