CREATE TABLE "QaSarBookSectionReview" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "sectionKey" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "comment" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarBookSectionReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QaSarBookSectionReview_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionReview_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionReview_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "QaSarBookSectionRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionReview_decision_check" CHECK ("decision" IN ('Approved', 'ChangesRequested'))
);

CREATE INDEX "QaSarBookSectionReview_cycleId_sectionKey_createdAt_idx"
  ON "QaSarBookSectionReview"("cycleId", "sectionKey", "createdAt" DESC);
CREATE INDEX "QaSarBookSectionReview_revisionId_createdAt_idx"
  ON "QaSarBookSectionReview"("revisionId", "createdAt" DESC);

ALTER TABLE "QaSarBookSectionReview" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "QaSarBookSectionReview" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookSectionReview" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookSectionReview" FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookSectionReview" FROM service_role';
  END IF;
END $$;
