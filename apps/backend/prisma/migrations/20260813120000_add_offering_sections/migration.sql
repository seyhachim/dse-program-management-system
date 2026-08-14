-- Existing offerings become Class A. Future terms may have A, B, and further
-- sections of the same course without duplicating the shared course spec.
ALTER TABLE "Offering" ADD COLUMN "sectionCode" TEXT NOT NULL DEFAULT 'A';

DROP INDEX "Offering_courseId_term_key";
CREATE UNIQUE INDEX "Offering_courseId_term_sectionCode_key"
  ON "Offering"("courseId", "term", "sectionCode");
