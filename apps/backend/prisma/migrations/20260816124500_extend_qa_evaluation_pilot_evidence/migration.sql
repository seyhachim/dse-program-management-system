-- Issue #194: allow controlled evaluation evidence to be passed through the
-- same expected-evidence rules used by the operational QA prototype.

ALTER TABLE "QaEvaluationScenarioEvidence"
  ADD COLUMN "evidenceType" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "QaEvaluationScenarioEvidence_scenarioId_evidenceType_idx"
  ON "QaEvaluationScenarioEvidence"("scenarioId", "evidenceType");
