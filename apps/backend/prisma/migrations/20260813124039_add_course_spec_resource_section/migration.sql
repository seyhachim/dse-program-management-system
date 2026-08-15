-- CreateEnum
CREATE TYPE "CourseSpecResourceSection" AS ENUM ('Resource', 'Reference');

-- AlterTable
ALTER TABLE "CourseSpecResource" ADD COLUMN     "section" "CourseSpecResourceSection" NOT NULL DEFAULT 'Resource';

-- CreateIndex
CREATE INDEX "CourseSpecResource_courseSpecId_section_idx" ON "CourseSpecResource"("courseSpecId", "section");

-- Backfill: rows carrying bibliographic metadata (authors/publisher/year/isbn/
-- basedOn) are the legacy CourseSpecReference rows the 20260813000000 migration
-- folded into this table (§20 was never wired up to read/write those columns
-- otherwise, issue #122). Verified against production (2026-08-13): every
-- currently-populated row has one of these columns set; `kind <> 'OTHER'` alone
-- is not a safe predicate here — two leftover rows from an abandoned earlier
-- redesign carry kind='requiredResource' with no bibliographic data and are
-- genuine §19 Resource rows, not references.
UPDATE "CourseSpecResource"
SET "section" = 'Reference'
WHERE "authors" <> '' OR "publisher" <> '' OR "year" <> '' OR "isbn" <> '' OR "basedOn" <> '';

-- The backfilled rows above are only readable through `reassembleSpec`'s
-- `hasSection("references")` gate, and `syncReferences` deletes every
-- `section = 'Reference'` row for a courseSpec on its first §20 save — so
-- without a CourseSpecSection("references") row, these rows are invisible in
-- both §19 and §20 and get silently destroyed the first time anyone saves
-- §20 for that course. Give each affected courseSpec a Draft §20 save-status
-- row (Draft, not Complete: nobody has reviewed this backfilled data) so the
-- wizard surfaces it instead.
INSERT INTO "CourseSpecSection" ("id", "courseSpecId", "sectionKey", "status", "updatedAt")
SELECT gen_random_uuid(), r."courseSpecId", 'references', 'Draft', now()
FROM "CourseSpecResource" r
WHERE r."section" = 'Reference'
GROUP BY r."courseSpecId"
ON CONFLICT ("courseSpecId", "sectionKey") DO NOTHING;
