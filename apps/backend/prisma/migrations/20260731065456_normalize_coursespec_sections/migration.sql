-- CreateEnum
CREATE TYPE "CourseSpecSectionStatus" AS ENUM ('Draft', 'Complete');

-- CreateEnum
CREATE TYPE "CloRowStatus" AS ENUM ('Active', 'Inactive');

-- CreateTable
CREATE TABLE "CourseSpecSection" (
    "id" TEXT NOT NULL,
    "courseSpecId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "status" "CourseSpecSectionStatus" NOT NULL DEFAULT 'Draft',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSpecSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSpecClo" (
    "id" TEXT NOT NULL,
    "courseSpecId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "level" TEXT,
    "mappedPlos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sltHours" INTEGER,
    "status" "CloRowStatus" NOT NULL DEFAULT 'Active',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CourseSpecClo_pkey" PRIMARY KEY ("courseSpecId","id")
);

-- CreateTable
CREATE TABLE "CourseSpecCloTeachingMethod" (
    "courseSpecId" TEXT NOT NULL,
    "cloId" TEXT NOT NULL,
    "teachingMethodId" TEXT NOT NULL,

    CONSTRAINT "CourseSpecCloTeachingMethod_pkey" PRIMARY KEY ("courseSpecId","cloId","teachingMethodId")
);

-- CreateTable
CREATE TABLE "CourseSpecCloAssessmentMethod" (
    "courseSpecId" TEXT NOT NULL,
    "cloId" TEXT NOT NULL,
    "assessmentMethodId" TEXT NOT NULL,

    CONSTRAINT "CourseSpecCloAssessmentMethod_pkey" PRIMARY KEY ("courseSpecId","cloId","assessmentMethodId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseSpecSection_courseSpecId_sectionKey_key" ON "CourseSpecSection"("courseSpecId", "sectionKey");

-- AddForeignKey
ALTER TABLE "CourseSpecSection" ADD CONSTRAINT "CourseSpecSection_courseSpecId_fkey" FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSpecClo" ADD CONSTRAINT "CourseSpecClo_courseSpecId_fkey" FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSpecCloTeachingMethod" ADD CONSTRAINT "CourseSpecCloTeachingMethod_courseSpecId_cloId_fkey" FOREIGN KEY ("courseSpecId", "cloId") REFERENCES "CourseSpecClo"("courseSpecId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSpecCloTeachingMethod" ADD CONSTRAINT "CourseSpecCloTeachingMethod_teachingMethodId_fkey" FOREIGN KEY ("teachingMethodId") REFERENCES "TeachingMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSpecCloAssessmentMethod" ADD CONSTRAINT "CourseSpecCloAssessmentMethod_courseSpecId_cloId_fkey" FOREIGN KEY ("courseSpecId", "cloId") REFERENCES "CourseSpecClo"("courseSpecId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSpecCloAssessmentMethod" ADD CONSTRAINT "CourseSpecCloAssessmentMethod_assessmentMethodId_fkey" FOREIGN KEY ("assessmentMethodId") REFERENCES "AssessmentMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (issue #81 phase A): decompose every existing CourseSpec.data/status
-- jsonb blob into CourseSpecSection, one row per key present in either `data` or
-- `status` (the union, since the app deletes `courseInfo` from `data` on save but
-- still records its status there, per saveSection in courses/service.ts). A
-- `sectionKey = 'clos'` row always gets `content = '{}'` here — CLO content is
-- backfilled separately into CourseSpecClo below, not left in this table.
INSERT INTO "CourseSpecSection" ("id", "courseSpecId", "sectionKey", "content", "status", "updatedAt")
SELECT
    gen_random_uuid()::text,
    cs."id",
    keys.key,
    CASE WHEN keys.key = 'clos' THEN '{}'::jsonb ELSE COALESCE(cs."data"->keys.key, '{}'::jsonb) END,
    CASE WHEN cs."status"->>keys.key = 'complete' THEN 'Complete'::"CourseSpecSectionStatus" ELSE 'Draft'::"CourseSpecSectionStatus" END,
    cs."updatedAt"
FROM "CourseSpec" cs
CROSS JOIN LATERAL (
    SELECT DISTINCT key FROM (
        SELECT jsonb_object_keys(cs."data") AS key
        UNION
        SELECT jsonb_object_keys(cs."status") AS key
    ) all_keys
) keys;

-- Backfill CLOs (issue #81 item 5): explode the old `data.clos.items` jsonb array
-- into normalized rows, preserving array position as `order`. The item's stored
-- `code` (e.g. "CLO1") is intentionally dropped, not carried over as a column —
-- `code` is re-derived from `order` on every read (courseService.reassembleSpec),
-- so there's one source of truth for CLO position instead of a stored value that
-- could drift from it. `id` is synthesized since the jsonb form never had one; a
-- stable id is what issue #81's method-FK join tables below key on.
INSERT INTO "CourseSpecClo" ("id", "courseSpecId", "order", "description", "level", "mappedPlos", "sltHours", "status", "notes")
SELECT
    gen_random_uuid()::text,
    cs."id",
    (item_ord - 1)::int,
    COALESCE(item->>'description', ''),
    item->>'level',
    COALESCE((SELECT array_agg(p) FROM jsonb_array_elements_text(item->'mappedPlos') p), ARRAY[]::text[]),
    NULLIF(item->>'sltHours', '')::int,
    CASE WHEN item->>'status' = 'inactive' THEN 'Inactive'::"CloRowStatus" ELSE 'Active'::"CloRowStatus" END,
    COALESCE(item->>'notes', '')
FROM "CourseSpec" cs
CROSS JOIN LATERAL jsonb_array_elements(cs."data"->'clos'->'items') WITH ORDINALITY AS t(item, item_ord);

-- Backfill teaching-method links (issue #81 item 5). teachingMethodIds was never
-- enforced against TeachingMethod before this migration, so an id that doesn't
-- match a real row is silently dropped here rather than aborting the backfill.
INSERT INTO "CourseSpecCloTeachingMethod" ("courseSpecId", "cloId", "teachingMethodId")
SELECT DISTINCT clo."courseSpecId", clo."id", tm."id"
FROM "CourseSpec" cs
CROSS JOIN LATERAL jsonb_array_elements(cs."data"->'clos'->'items') WITH ORDINALITY AS t(item, item_ord)
JOIN "CourseSpecClo" clo ON clo."courseSpecId" = cs."id" AND clo."order" = item_ord - 1
CROSS JOIN LATERAL jsonb_array_elements_text(item->'teachingMethodIds') AS tmid(id)
JOIN "TeachingMethod" tm ON tm."id" = tmid.id;

-- Backfill assessment-method links (issue #81 item 5), same dangling-id handling
-- as teaching methods above.
INSERT INTO "CourseSpecCloAssessmentMethod" ("courseSpecId", "cloId", "assessmentMethodId")
SELECT DISTINCT clo."courseSpecId", clo."id", am."id"
FROM "CourseSpec" cs
CROSS JOIN LATERAL jsonb_array_elements(cs."data"->'clos'->'items') WITH ORDINALITY AS t(item, item_ord)
JOIN "CourseSpecClo" clo ON clo."courseSpecId" = cs."id" AND clo."order" = item_ord - 1
CROSS JOIN LATERAL jsonb_array_elements_text(item->'assessmentMethodIds') AS amid(id)
JOIN "AssessmentMethod" am ON am."id" = amid.id;
