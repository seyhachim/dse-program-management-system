-- Issue #542: make programme year explicit on append-only progression evidence.
-- Existing historical rows remain valid with NULL programmeYear because their exact
-- year cannot be reconstructed safely from intake year alone (retention/inactivity
-- can shift a student's academic year). New API writes require an explicit year.

ALTER TABLE "StudentProgressionRecord"
  ADD COLUMN "programmeYear" INTEGER;

ALTER TABLE "StudentProgressionRecord"
  ADD CONSTRAINT "StudentProgressionRecord_programme_year_range"
  CHECK ("programmeYear" IS NULL OR ("programmeYear" >= 1 AND "programmeYear" <= 4));

CREATE INDEX "StudentProgressionRecord_membershipId_programmeYear_periodStart_idx"
  ON "StudentProgressionRecord"("membershipId", "programmeYear", "periodStart");
