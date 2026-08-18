-- Issue #310: deterministic controlled evaluation dataset metadata.
ALTER TABLE "QaEvaluationScenario"
  ADD COLUMN "scenarioType" TEXT NOT NULL DEFAULT 'positiveEvidence',
  ADD COLUMN "difficulty" TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN "datasetVersion" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "scenarioVersion" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "QaEvaluationScenario_datasetVersion_scenarioType_idx"
  ON "QaEvaluationScenario" ("datasetVersion", "scenarioType");

-- Existing pilot history predates explicit dataset metadata and may legitimately
-- contain multiple scenarios for one expectation. Enforce stable identity only
-- for explicitly versioned datasets introduced by #310.
CREATE UNIQUE INDEX "QaEvaluationScenario_dataset_identity_key"
  ON "QaEvaluationScenario" ("datasetVersion", "requirementId", "expectationId", "scenarioType", "scenarioVersion")
  WHERE "datasetVersion" <> 'legacy';
