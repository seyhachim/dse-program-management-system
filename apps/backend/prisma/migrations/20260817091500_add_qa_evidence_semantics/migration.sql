-- Issues #296-#299: persist applicability, scope, temporal and provenance semantics.
-- These columns are additive except that analysis/evaluation coverage state becomes
-- nullable when applicability prevents the evidence-coverage classifier from running.
-- pointInTime is the backward-compatible temporal default: a record that pre-dates
-- the assessment-cycle start can remain the authoritative current record unless an
-- expectation explicitly opts into withinCycle/recent/multiPeriod/longitudinal rules.

ALTER TABLE "QaQualityExpectation"
  ADD COLUMN "applicabilityRule" JSONB NOT NULL DEFAULT '{"kind":"always"}'::jsonb,
  ADD COLUMN "scopeRequirement" JSONB NOT NULL DEFAULT '{"requiredDimensions":[]}'::jsonb,
  ADD COLUMN "temporalRule" JSONB NOT NULL DEFAULT '{"kind":"pointInTime"}'::jsonb;

ALTER TABLE "QaExpectedEvidence"
  ADD COLUMN "scopeRequirement" JSONB NOT NULL DEFAULT '{"requiredDimensions":[]}'::jsonb,
  ADD COLUMN "temporalRule" JSONB NOT NULL DEFAULT '{"kind":"pointInTime"}'::jsonb,
  ADD COLUMN "authorityRequirement" JSONB NOT NULL DEFAULT '{"minimumAuthority":"unknown"}'::jsonb;

-- Every current QA expectation is programme-scoped. More specific dimensions are
-- declared on each expected-evidence form so programme-wide analysis can require
-- a candidate to identify its own course/version/offering without inventing one
-- target course for the whole requirement.
UPDATE "QaQualityExpectation"
SET "scopeRequirement" = '{"requiredDimensions":["programme"]}'::jsonb;

UPDATE "QaExpectedEvidence"
SET "scopeRequirement" = CASE
  WHEN "evidenceType" IN (
    'clo-plo-mappings', 'approved-course-specs', 'approved-course-specifications',
    'clo-teaching-alignment', 'course-clo-plo-coverage', 'course-teaching-philosophy',
    'active-learning-strategies', 'weekly-alignment', 'weekly-student-activities',
    'clo-assessment-alignment', 'clo-assessment-methods'
  ) THEN '{"requiredDimensions":["programme","course","courseSpecVersion"]}'::jsonb
  WHEN "evidenceType" IN ('assessment-plan', 'feedback-plan', 'published-results', 'published-feedback')
    THEN '{"requiredDimensions":["programme","course","courseSpecVersion","assessment"]}'::jsonb
  WHEN "evidenceType" IN ('approval-history', 'course-spec-review-history', 'programme-structure')
    THEN '{"requiredDimensions":["programme","course"]}'::jsonb
  WHEN "evidenceType" IN ('lecturer-assignments', 'teaching-assignments')
    THEN '{"requiredDimensions":["programme","course","offering","term"]}'::jsonb
  WHEN "evidenceType" = 'weekly-workload'
    THEN '{"requiredDimensions":["programme","course","term"]}'::jsonb
  ELSE '{"requiredDimensions":["programme"]}'::jsonb
END;

-- Structured PMS records must have at least controlled-internal authority. Approved
-- specification evidence is stricter. Document-style evidence can start as uploaded
-- external material and be reviewed by a human later.
UPDATE "QaExpectedEvidence"
SET "authorityRequirement" = CASE
  WHEN "evidenceType" IN ('approved-course-specs', 'approved-course-specifications')
    THEN '{"minimumAuthority":"approvedDocument"}'::jsonb
  WHEN "sourceDomain" IN ('document', 'survey', 'minutes', 'policy')
    THEN '{"minimumAuthority":"uploadedExternalDocument"}'::jsonb
  ELSE '{"minimumAuthority":"controlledInternalRecord"}'::jsonb
END;

-- Evidence that represents actual results/feedback must belong to the assessment
-- cycle rather than silently relying on an old result set. Programme-level outcome
-- syntheses are explicitly longitudinal and require at least two comparable periods.
UPDATE "QaExpectedEvidence"
SET "temporalRule" = '{"kind":"withinCycle"}'::jsonb
WHERE "evidenceType" IN ('published-results', 'published-feedback', 'clo-achievement');

UPDATE "QaExpectedEvidence"
SET "temporalRule" = '{"kind":"longitudinal","minimumPeriods":2}'::jsonb
WHERE "evidenceType" IN ('programme-outcome-analysis', 'plo-synthesis');

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
