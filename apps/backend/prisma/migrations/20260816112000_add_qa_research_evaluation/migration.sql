-- Issue #193: controlled research evaluation data, isolated from live programme QA records.

CREATE TABLE "QaEvaluationScenario" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "expectationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "goldState" "QaEvidenceAnalysisState",
    "goldReviewerId" TEXT,
    "goldAnnotatedAt" TIMESTAMP(3),
    "goldNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QaEvaluationScenario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QaEvaluationScenarioEvidence" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "referenceKey" TEXT NOT NULL DEFAULT '',
    "reportingDate" TIMESTAMP(3),
    "goldRelevant" BOOLEAN,
    CONSTRAINT "QaEvaluationScenarioEvidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QaEvaluationScenarioEvidence_order_check" CHECK ("order" >= 0),
    CONSTRAINT "QaEvaluationScenarioEvidence_domain_check"
      CHECK ("sourceDomain" IN ('programme','outcomes','courseSpec','teachingLearning','weeklyPlan','assessment','staff','offering','document','survey','minutes','policy'))
);

CREATE TABLE "QaEvaluationRun" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "predictedState" "QaEvidenceAnalysisState" NOT NULL,
    "engine" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL DEFAULT '',
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QaEvaluationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QaEvaluationRunEvidence" (
    "runId" TEXT NOT NULL,
    "scenarioEvidenceId" TEXT NOT NULL,
    "relevance" DOUBLE PRECISION,
    CONSTRAINT "QaEvaluationRunEvidence_pkey" PRIMARY KEY ("runId", "scenarioEvidenceId"),
    CONSTRAINT "QaEvaluationRunEvidence_relevance_check"
      CHECK ("relevance" IS NULL OR ("relevance" >= 0 AND "relevance" <= 1))
);

CREATE TABLE "QaEvaluationHumanRating" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "evidenceRelevance" INTEGER NOT NULL,
    "explanationClarity" INTEGER NOT NULL,
    "understandability" INTEGER NOT NULL,
    "usefulness" INTEGER NOT NULL,
    "traceability" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QaEvaluationHumanRating_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QaEvaluationHumanRating_evidenceRelevance_check" CHECK ("evidenceRelevance" BETWEEN 1 AND 5),
    CONSTRAINT "QaEvaluationHumanRating_explanationClarity_check" CHECK ("explanationClarity" BETWEEN 1 AND 5),
    CONSTRAINT "QaEvaluationHumanRating_understandability_check" CHECK ("understandability" BETWEEN 1 AND 5),
    CONSTRAINT "QaEvaluationHumanRating_usefulness_check" CHECK ("usefulness" BETWEEN 1 AND 5),
    CONSTRAINT "QaEvaluationHumanRating_traceability_check" CHECK ("traceability" BETWEEN 1 AND 5)
);

CREATE INDEX "QaEvaluationScenario_requirementId_idx" ON "QaEvaluationScenario"("requirementId");
CREATE INDEX "QaEvaluationScenario_expectationId_idx" ON "QaEvaluationScenario"("expectationId");
CREATE INDEX "QaEvaluationScenario_goldState_idx" ON "QaEvaluationScenario"("goldState");
CREATE UNIQUE INDEX "QaEvaluationScenarioEvidence_scenarioId_order_key" ON "QaEvaluationScenarioEvidence"("scenarioId", "order");
CREATE INDEX "QaEvaluationScenarioEvidence_scenarioId_goldRelevant_idx" ON "QaEvaluationScenarioEvidence"("scenarioId", "goldRelevant");
CREATE INDEX "QaEvaluationRun_scenarioId_createdAt_idx" ON "QaEvaluationRun"("scenarioId", "createdAt");
CREATE INDEX "QaEvaluationRun_engine_engineVersion_promptVersion_idx" ON "QaEvaluationRun"("engine", "engineVersion", "promptVersion");
CREATE INDEX "QaEvaluationRunEvidence_scenarioEvidenceId_idx" ON "QaEvaluationRunEvidence"("scenarioEvidenceId");
CREATE UNIQUE INDEX "QaEvaluationHumanRating_runId_reviewerId_key" ON "QaEvaluationHumanRating"("runId", "reviewerId");
CREATE INDEX "QaEvaluationHumanRating_reviewerId_idx" ON "QaEvaluationHumanRating"("reviewerId");

ALTER TABLE "QaEvaluationScenario" ADD CONSTRAINT "QaEvaluationScenario_requirementId_fkey"
  FOREIGN KEY ("requirementId") REFERENCES "QaRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvaluationScenario" ADD CONSTRAINT "QaEvaluationScenario_expectationId_fkey"
  FOREIGN KEY ("expectationId") REFERENCES "QaQualityExpectation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvaluationScenario" ADD CONSTRAINT "QaEvaluationScenario_goldReviewerId_fkey"
  FOREIGN KEY ("goldReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QaEvaluationScenarioEvidence" ADD CONSTRAINT "QaEvaluationScenarioEvidence_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "QaEvaluationScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaEvaluationRun" ADD CONSTRAINT "QaEvaluationRun_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "QaEvaluationScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaEvaluationRunEvidence" ADD CONSTRAINT "QaEvaluationRunEvidence_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "QaEvaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaEvaluationRunEvidence" ADD CONSTRAINT "QaEvaluationRunEvidence_scenarioEvidenceId_fkey"
  FOREIGN KEY ("scenarioEvidenceId") REFERENCES "QaEvaluationScenarioEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaEvaluationHumanRating" ADD CONSTRAINT "QaEvaluationHumanRating_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "QaEvaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaEvaluationHumanRating" ADD CONSTRAINT "QaEvaluationHumanRating_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
