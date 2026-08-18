-- Issue #191: immutable human validation history for QA evidence analyses.
CREATE TYPE "QaAnalysisReviewDecision" AS ENUM ('Confirmed', 'Rejected', 'NeedsMoreEvidence');

CREATE TABLE "QaEvidenceAnalysisReview" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "QaAnalysisReviewDecision" NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QaEvidenceAnalysisReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QaEvidenceAnalysisReview_programmeId_createdAt_idx"
  ON "QaEvidenceAnalysisReview"("programmeId", "createdAt");
CREATE INDEX "QaEvidenceAnalysisReview_analysisId_createdAt_idx"
  ON "QaEvidenceAnalysisReview"("analysisId", "createdAt");
CREATE INDEX "QaEvidenceAnalysisReview_reviewerId_idx"
  ON "QaEvidenceAnalysisReview"("reviewerId");

ALTER TABLE "QaEvidenceAnalysisReview" ADD CONSTRAINT "QaEvidenceAnalysisReview_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceAnalysisReview" ADD CONSTRAINT "QaEvidenceAnalysisReview_analysisId_fkey"
  FOREIGN KEY ("analysisId") REFERENCES "QaEvidenceAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaEvidenceAnalysisReview" ADD CONSTRAINT "QaEvidenceAnalysisReview_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
