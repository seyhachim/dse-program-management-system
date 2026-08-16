-- Issue #231: immutable SAR submissions and append-only human review.

CREATE TYPE "QaSarReviewDecision" AS ENUM (
  'Approved',
  'ChangesRequested',
  'MoreEvidenceRequested'
);

CREATE TABLE "QaSarSubmission" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "content" JSONB NOT NULL,
  "plainText" TEXT NOT NULL,
  "practiceDescribed" BOOLEAN NOT NULL,
  "resultsAnalysed" BOOLEAN NOT NULL,
  "improvementExplained" BOOLEAN NOT NULL,
  "evidenceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "submittedById" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QaSarReview" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "decision" "QaSarReviewDecision" NOT NULL,
  "comment" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QaSarSubmission_sectionId_version_key"
  ON "QaSarSubmission"("sectionId", "version");
CREATE INDEX "QaSarSubmission_programmeId_cycleId_idx"
  ON "QaSarSubmission"("programmeId", "cycleId");
CREATE INDEX "QaSarSubmission_requirementId_idx"
  ON "QaSarSubmission"("requirementId");
CREATE INDEX "QaSarSubmission_submittedById_idx"
  ON "QaSarSubmission"("submittedById");
CREATE INDEX "QaSarReview_submissionId_createdAt_idx"
  ON "QaSarReview"("submissionId", "createdAt");
CREATE INDEX "QaSarReview_reviewerId_idx"
  ON "QaSarReview"("reviewerId");

ALTER TABLE "QaSarSubmission"
  ADD CONSTRAINT "QaSarSubmission_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaSarSubmission"
  ADD CONSTRAINT "QaSarSubmission_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaSarSubmission"
  ADD CONSTRAINT "QaSarSubmission_requirementId_fkey"
  FOREIGN KEY ("requirementId") REFERENCES "QaRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaSarSubmission"
  ADD CONSTRAINT "QaSarSubmission_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "QaSarSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaSarSubmission"
  ADD CONSTRAINT "QaSarSubmission_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaSarReview"
  ADD CONSTRAINT "QaSarReview_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "QaSarSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaSarReview"
  ADD CONSTRAINT "QaSarReview_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QaSarSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaSarReview" ENABLE ROW LEVEL SECURITY;
