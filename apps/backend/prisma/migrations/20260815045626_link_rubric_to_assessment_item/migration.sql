/*
  Warnings:

  - You are about to drop the column `rubric` on the `CourseSpecAssessmentItem` table. All the data in the column will be lost.

  Issue #123: `rubric` was an unenforced string the wizard already populated with a
  `Rubric.id` (or "" for none) but the DB never validated. This backfills any
  already-valid link into the new `rubricId` FK before dropping the old column, so
  a `rubric` value that isn't a real Rubric.id (free text, or a since-deleted
  rubric) is dropped rather than left dangling under a constraint that would reject it.
*/
-- AlterTable: add the new FK column first, alongside the old one
ALTER TABLE "CourseSpecAssessmentItem" ADD COLUMN     "rubricId" TEXT;

-- Backfill: carry over only values that resolve to a real Rubric row
UPDATE "CourseSpecAssessmentItem" ai
SET "rubricId" = ai."rubric"
WHERE ai."rubric" != '' AND EXISTS (
  SELECT 1 FROM "Rubric" r WHERE r."id" = ai."rubric"
);

-- CreateIndex
CREATE INDEX "CourseSpecAssessmentItem_rubricId_idx" ON "CourseSpecAssessmentItem"("rubricId");

-- AddForeignKey
ALTER TABLE "CourseSpecAssessmentItem" ADD CONSTRAINT "CourseSpecAssessmentItem_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: now safe to drop the old unenforced string column
ALTER TABLE "CourseSpecAssessmentItem" DROP COLUMN "rubric";
