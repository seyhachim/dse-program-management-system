-- Issue #230: structured, continuous SAR authoring per AUN-QA requirement.
-- SAR writing remains separate from evidence analysis and human AUN-QA ratings.

CREATE TYPE "QaSarSectionStatus" AS ENUM (
  'NotStarted',
  'Drafting',
  'ReadyForReview',
  'UnderReview',
  'ChangesRequested',
  'Approved'
);

CREATE TABLE "QaSarSection" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "plainText" TEXT NOT NULL DEFAULT '',
  "status" "QaSarSectionStatus" NOT NULL DEFAULT 'NotStarted',
  "practiceDescribed" BOOLEAN NOT NULL DEFAULT false,
  "resultsAnalysed" BOOLEAN NOT NULL DEFAULT false,
  "improvementExplained" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarSection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QaSarSection_cycleId_requirementId_key"
  ON "QaSarSection"("cycleId", "requirementId");
CREATE INDEX "QaSarSection_programmeId_cycleId_idx"
  ON "QaSarSection"("programmeId", "cycleId");
CREATE INDEX "QaSarSection_status_idx" ON "QaSarSection"("status");
CREATE INDEX "QaSarSection_updatedById_idx" ON "QaSarSection"("updatedById");

ALTER TABLE "QaSarSection"
  ADD CONSTRAINT "QaSarSection_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaSarSection"
  ADD CONSTRAINT "QaSarSection_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaSarSection"
  ADD CONSTRAINT "QaSarSection_requirementId_fkey"
  FOREIGN KEY ("requirementId") REFERENCES "QaRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaSarSection"
  ADD CONSTRAINT "QaSarSection_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QaSarSection" ENABLE ROW LEVEL SECURITY;
