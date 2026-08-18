-- Issue #310: deterministic controlled evaluation dataset metadata.
ALTER TABLE "QaEvaluationScenario"
  ADD COLUMN "scenarioType" TEXT NOT NULL DEFAULT 'positiveEvidence',
  ADD COLUMN "difficulty" TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN "datasetVersion" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "scenarioVersion" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "QaEvaluationScenario_datasetVersion_scenarioType_idx"
  ON "QaEvaluationScenario" ("datasetVersion", "scenarioType");

CREATE UNIQUE INDEX "QaEvaluationScenario_dataset_identity_key"
  ON "QaEvaluationScenario" ("datasetVersion", "requirementId", "expectationId", "scenarioType", "scenarioVersion");
