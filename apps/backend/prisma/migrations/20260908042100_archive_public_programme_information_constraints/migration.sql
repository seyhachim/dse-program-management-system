-- Issue #918: retain previously published public information instead of hard deleting it.
-- `publishedAt` is first-publication provenance and remains populated while a record
-- is hidden (Draft after unpublish) or Archived.

ALTER TABLE "ProgrammeFaq"
  DROP CONSTRAINT IF EXISTS "ProgrammeFaq_publication_state_check";

ALTER TABLE "ProgrammeFaq"
  ADD CONSTRAINT "ProgrammeFaq_publication_state_check" CHECK (
    ("status" = 'Draft')
    OR ("status" = 'Published' AND "publishedAt" IS NOT NULL)
    OR ("status" = 'Archived' AND "publishedAt" IS NOT NULL)
  );

ALTER TABLE "ProgrammeImportantDate"
  DROP CONSTRAINT IF EXISTS "ProgrammeImportantDate_publication_state_check";

ALTER TABLE "ProgrammeImportantDate"
  ADD CONSTRAINT "ProgrammeImportantDate_publication_state_check" CHECK (
    ("status" = 'Draft')
    OR ("status" = 'Published' AND "publishedAt" IS NOT NULL)
    OR ("status" = 'Archived' AND "publishedAt" IS NOT NULL)
  );

-- Existing Published rows already carry publishedAt and immediately gain deletion
-- protection after this migration. Existing Draft rows cannot be reliably identified
-- as formerly published because the pre-#918 unpublish flow cleared publishedAt;
-- they are intentionally left unchanged rather than inventing historical provenance.
