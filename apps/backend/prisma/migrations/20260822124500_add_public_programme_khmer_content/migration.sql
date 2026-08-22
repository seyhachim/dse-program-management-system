-- Issue #545: additive bilingual public programme content.
-- English fields remain authoritative fallback; NULL Khmer fields mean "use English".
-- Translations live on the same logical records and therefore share the existing Draft/Published lifecycle.
ALTER TABLE "ProgrammeFaq"
  ADD COLUMN "questionKm" TEXT,
  ADD COLUMN "answerKm" TEXT,
  ADD COLUMN "shortAnswerKm" TEXT,
  ADD COLUMN "keywordsKm" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ProgrammeImportantDate"
  ADD COLUMN "titleKm" TEXT,
  ADD COLUMN "descriptionKm" TEXT;

ALTER TABLE "ProgrammePublicProfile"
  ADD COLUMN "programmeNameKm" TEXT,
  ADD COLUMN "shortNameKm" TEXT,
  ADD COLUMN "overviewKm" TEXT,
  ADD COLUMN "campusAddressKm" TEXT;
