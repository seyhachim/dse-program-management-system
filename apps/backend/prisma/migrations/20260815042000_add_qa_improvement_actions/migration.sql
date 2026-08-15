-- Issue #192: continuous quality improvement actions linked to validated QA evidence findings.
CREATE TYPE "QaImprovementActionStatus" AS ENUM ('Open', 'InProgress', 'Completed', 'Cancelled');

CREATE TABLE "QaImprovementAction" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "ownerId" TEXT,
    "plannedAction" TEXT NOT NULL,
    "indicator" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "QaImprovementActionStatus" NOT NULL DEFAULT 'Open',
    "result" TEXT NOT NULL DEFAULT '',
    "effectivenessReview" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "carriedFromActionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QaImprovementAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QaImprovementAction_programmeId_status_dueDate_idx"
  ON "QaImprovementAction"("programmeId", "status", "dueDate");
CREATE INDEX "QaImprovementAction_cycleId_status_idx"
  ON "QaImprovementAction"("cycleId", "status");
CREATE INDEX "QaImprovementAction_requirementId_idx"
  ON "QaImprovementAction"("requirementId");
CREATE INDEX "QaImprovementAction_analysisId_idx"
  ON "QaImprovementAction"("analysisId");
CREATE INDEX "QaImprovementAction_reviewId_idx"
  ON "QaImprovementAction"("reviewId");
CREATE INDEX "QaImprovementAction_ownerId_idx"
  ON "QaImprovementAction"("ownerId");
CREATE INDEX "QaImprovementAction_carriedFromActionId_idx"
  ON "QaImprovementAction"("carriedFromActionId");

ALTER TABLE "QaImprovementAction" ADD CONSTRAINT "QaImprovementAction_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaImprovementAction" ADD CONSTRAINT "QaImprovementAction_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaImprovementAction" ADD CONSTRAINT "QaImprovementAction_requirementId_fkey"
  FOREIGN KEY ("requirementId") REFERENCES "QaRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaImprovementAction" ADD CONSTRAINT "QaImprovementAction_analysisId_fkey"
  FOREIGN KEY ("analysisId") REFERENCES "QaEvidenceAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaImprovementAction" ADD CONSTRAINT "QaImprovementAction_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "QaEvidenceAnalysisReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaImprovementAction" ADD CONSTRAINT "QaImprovementAction_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QaImprovementAction" ADD CONSTRAINT "QaImprovementAction_carriedFromActionId_fkey"
  FOREIGN KEY ("carriedFromActionId") REFERENCES "QaImprovementAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
