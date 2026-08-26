CREATE TABLE "QaSarBookNarrativeSection" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "sectionKey" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "plainText" TEXT NOT NULL DEFAULT '',
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarBookNarrativeSection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QaSarBookNarrativeSection_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookNarrativeSection_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookNarrativeSection_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QaSarBookNarrativeSection_cycleId_sectionKey_key"
  ON "QaSarBookNarrativeSection"("cycleId", "sectionKey");
CREATE INDEX "QaSarBookNarrativeSection_programmeId_cycleId_idx"
  ON "QaSarBookNarrativeSection"("programmeId", "cycleId");
CREATE INDEX "QaSarBookNarrativeSection_updatedById_idx"
  ON "QaSarBookNarrativeSection"("updatedById");

REVOKE ALL ON TABLE "QaSarBookNarrativeSection" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookNarrativeSection" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookNarrativeSection" FROM authenticated';
  END IF;
END $$;
