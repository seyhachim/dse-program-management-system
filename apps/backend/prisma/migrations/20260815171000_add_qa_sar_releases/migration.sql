-- Issue #232: immutable official SAR releases pinned to exact approved submissions.

CREATE TABLE "QaSarRelease" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "templateVersion" TEXT NOT NULL DEFAULT 'aun-qa-sar-v1',
  "snapshot" JSONB NOT NULL,
  "submissionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "finalizedById" TEXT NOT NULL,
  "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QaSarRelease_cycleId_version_key"
  ON "QaSarRelease"("cycleId", "version");
CREATE INDEX "QaSarRelease_programmeId_cycleId_idx"
  ON "QaSarRelease"("programmeId", "cycleId");
CREATE INDEX "QaSarRelease_finalizedById_idx"
  ON "QaSarRelease"("finalizedById");

ALTER TABLE "QaSarRelease"
  ADD CONSTRAINT "QaSarRelease_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaSarRelease"
  ADD CONSTRAINT "QaSarRelease_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaSarRelease"
  ADD CONSTRAINT "QaSarRelease_finalizedById_fkey"
  FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QaSarRelease" ENABLE ROW LEVEL SECURITY;
