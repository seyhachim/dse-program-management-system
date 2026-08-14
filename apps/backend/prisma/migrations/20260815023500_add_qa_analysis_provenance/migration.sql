-- Issue #187: append-only QA evidence-analysis history and source provenance.
-- Additive only. Analysis findings remain advisory and separate from human AUN-QA ratings.

CREATE TYPE "QaEvidenceAnalysisState" AS ENUM (
    'EvidenceIdentified',
    'PotentialEvidenceGap',
    'ExpertReviewRequired'
);

CREATE TABLE "QaEvidenceAnalysis" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "expectationId" TEXT NOT NULL,
    "state" "QaEvidenceAnalysisState" NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    "confidence" DOUBLE PRECISION,
    "uncertaintyNote" TEXT NOT NULL DEFAULT '',
    "engine" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QaEvidenceAnalysis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QaEvidenceAnalysis_confidence_check"
      CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);

CREATE TABLE "QaEvidenceAnalysisSource" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "candidateKey" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "qaEvidenceId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "excerpt" TEXT NOT NULL DEFAULT '',
    "route" TEXT,
    "reportingDate" TIMESTAMP(3),
    "relevance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QaEvidenceAnalysisSource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QaEvidenceAnalysisSource_kind_check"
      CHECK ("sourceKind" IN ('structuredCandidate', 'qaEvidence', 'documentChunk')),
    CONSTRAINT "QaEvidenceAnalysisSource_domain_check"
      CHECK ("sourceDomain" IN ('programme','outcomes','courseSpec','teachingLearning','weeklyPlan','assessment','staff','offering','document','survey','minutes','policy')),
    CONSTRAINT "QaEvidenceAnalysisSource_relevance_check"
      CHECK ("relevance" IS NULL OR ("relevance" >= 0 AND "relevance" <= 1))
);

CREATE INDEX "QaEvidenceAnalysis_programmeId_cycleId_createdAt_idx"
  ON "QaEvidenceAnalysis"("programmeId", "cycleId", "createdAt");
CREATE INDEX "QaEvidenceAnalysis_requirementId_createdAt_idx"
  ON "QaEvidenceAnalysis"("requirementId", "createdAt");
CREATE INDEX "QaEvidenceAnalysis_expectationId_createdAt_idx"
  ON "QaEvidenceAnalysis"("expectationId", "createdAt");
CREATE UNIQUE INDEX "QaEvidenceAnalysisSource_analysisId_candidateKey_key"
  ON "QaEvidenceAnalysisSource"("analysisId", "candidateKey");
CREATE INDEX "QaEvidenceAnalysisSource_qaEvidenceId_idx"
  ON "QaEvidenceAnalysisSource"("qaEvidenceId");
CREATE INDEX "QaEvidenceAnalysisSource_entityType_entityId_idx"
  ON "QaEvidenceAnalysisSource"("entityType", "entityId");

ALTER TABLE "QaEvidenceAnalysis" ADD CONSTRAINT "QaEvidenceAnalysis_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceAnalysis" ADD CONSTRAINT "QaEvidenceAnalysis_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceAnalysis" ADD CONSTRAINT "QaEvidenceAnalysis_requirementId_fkey"
  FOREIGN KEY ("requirementId") REFERENCES "QaRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceAnalysis" ADD CONSTRAINT "QaEvidenceAnalysis_expectationId_fkey"
  FOREIGN KEY ("expectationId") REFERENCES "QaQualityExpectation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceAnalysisSource" ADD CONSTRAINT "QaEvidenceAnalysisSource_analysisId_fkey"
  FOREIGN KEY ("analysisId") REFERENCES "QaEvidenceAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceAnalysisSource" ADD CONSTRAINT "QaEvidenceAnalysisSource_qaEvidenceId_fkey"
  FOREIGN KEY ("qaEvidenceId") REFERENCES "QaEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
