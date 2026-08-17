-- Issues #296-#299: persist applicability, scope, temporal and provenance semantics.
-- These columns are additive except that analysis/evaluation coverage state becomes
-- nullable when applicability prevents the evidence-coverage classifier from running.

ALTER TABLE "QaQualityExpectation"
  ADD COLUMN "applicabilityRule" JSONB NOT NULL DEFAULT '{"kind":"always"}'::jsonb,
  ADD COLUMN "scopeRequirement" JSONB NOT NULL DEFAULT '{"requiredDimensions":[]}'::jsonb,
  ADD COLUMN "temporalRule" JSONB NOT NULL DEFAULT '{"kind":"withinCycle"}'::jsonb;

ALTER TABLE "QaExpectedEvidence"
  ADD COLUMN "scopeRequirement" JSONB NOT NULL DEFAULT '{"requiredDimensions":[]}'::jsonb,
  ADD COLUMN "temporalRule" JSONB NOT NULL DEFAULT '{"kind":"withinCycle"}'::jsonb,
  ADD COLUMN "authorityRequirement" JSONB NOT NULL DEFAULT '{"minimumAuthority":"unknown"}'::jsonb;

ALTER TABLE "QaEvidenceAnalysis"
  ALTER COLUMN "state" DROP NOT NULL,
  ADD COLUMN "applicability" TEXT NOT NULL DEFAULT 'applicable',
  ADD COLUMN "applicabilityReason" TEXT NOT NULL DEFAULT '';

ALTER TABLE "QaEvidenceAnalysis"
  ADD CONSTRAINT "QaEvidenceAnalysis_applicability_check"
  CHECK ("applicability" IN ('applicable', 'notApplicable', 'uncertain')),
  ADD CONSTRAINT "QaEvidenceAnalysis_coverage_applicability_check"
  CHECK (
    ("applicability" = 'applicable' AND "state" IS NOT NULL)
    OR ("applicability" <> 'applicable' AND "state" IS NULL)
  );

ALTER TABLE "QaEvidenceAnalysisSource"
  ADD COLUMN "scope" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "scopeMatch" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "temporalMatch" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "provenance" JSONB NOT NULL DEFAULT '{"authority":"unknown","ownerUnit":null,"version":null,"approvalStatus":null,"sourceUri":null}'::jsonb,
  ADD COLUMN "authorityMatch" BOOLEAN,
  ADD COLUMN "periodKey" TEXT;

ALTER TABLE "QaEvidenceAnalysisSource"
  ADD CONSTRAINT "QaEvidenceAnalysisSource_scope_match_check"
  CHECK ("scopeMatch" IN ('exact', 'partial', 'mismatch', 'unknown')),
  ADD CONSTRAINT "QaEvidenceAnalysisSource_temporal_match_check"
  CHECK ("temporalMatch" IN ('current', 'historicalRelevant', 'stale', 'future', 'insufficientHistory', 'unknown'));

ALTER TABLE "QaEvaluationScenario"
  ADD COLUMN "goldApplicability" TEXT;

ALTER TABLE "QaEvaluationScenario"
  ADD CONSTRAINT "QaEvaluationScenario_gold_applicability_check"
  CHECK ("goldApplicability" IS NULL OR "goldApplicability" IN ('applicable', 'notApplicable', 'uncertain'));

ALTER TABLE "QaEvaluationScenarioEvidence"
  ADD COLUMN "scope" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "provenance" JSONB NOT NULL DEFAULT '{"authority":"unknown","ownerUnit":null,"version":null,"approvalStatus":null,"sourceUri":null}'::jsonb,
  ADD COLUMN "periodKey" TEXT;

ALTER TABLE "QaEvaluationRun"
  ALTER COLUMN "predictedState" DROP NOT NULL,
  ADD COLUMN "predictedApplicability" TEXT NOT NULL DEFAULT 'applicable';

ALTER TABLE "QaEvaluationRun"
  ADD CONSTRAINT "QaEvaluationRun_predicted_applicability_check"
  CHECK ("predictedApplicability" IN ('applicable', 'notApplicable', 'uncertain')),
  ADD CONSTRAINT "QaEvaluationRun_coverage_applicability_check"
  CHECK (
    ("predictedApplicability" = 'applicable' AND "predictedState" IS NOT NULL)
    OR ("predictedApplicability" <> 'applicable' AND "predictedState" IS NULL)
  );

CREATE INDEX "QaEvidenceAnalysis_applicability_idx"
  ON "QaEvidenceAnalysis" ("applicability", "createdAt");
CREATE INDEX "QaEvidenceAnalysisSource_scopeMatch_temporalMatch_idx"
  ON "QaEvidenceAnalysisSource" ("scopeMatch", "temporalMatch");
CREATE INDEX "QaEvaluationRun_predictedApplicability_idx"
  ON "QaEvaluationRun" ("predictedApplicability", "createdAt");
