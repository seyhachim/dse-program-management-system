-- CreateEnum
CREATE TYPE "AssessmentItemMode" AS ENUM ('Individual', 'Group');

-- CreateEnum
CREATE TYPE "AssessmentItemStatus" AS ENUM ('Active', 'Inactive');

-- CreateEnum
CREATE TYPE "MappingComponentKind" AS ENUM ('Week', 'Assessment');

-- CreateTable
CREATE TABLE "CourseSpecWeek" (
    "id" TEXT NOT NULL,
    "courseSpecId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "cloCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lloItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lectureHours" DOUBLE PRECISION,
    "tutorialHours" DOUBLE PRECISION,
    "practiceHours" DOUBLE PRECISION,
    "otherHours" DOUBLE PRECISION,
    "selfStudyHours" DOUBLE PRECISION,
    "assessment" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CourseSpecWeek_pkey" PRIMARY KEY ("courseSpecId","id")
);

-- CreateTable
CREATE TABLE "CourseSpecAssessmentItem" (
    "id" TEXT NOT NULL,
    "courseSpecId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "mode" "AssessmentItemMode" NOT NULL DEFAULT 'Individual',
    "status" "AssessmentItemStatus" NOT NULL DEFAULT 'Active',
    "cloCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bloomLevel" TEXT,
    "weight" DOUBLE PRECISION,
    "dueWeek" INTEGER,
    "durationWeeks" DOUBLE PRECISION,
    "format" TEXT NOT NULL DEFAULT '',
    "submissionMethod" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "rubric" TEXT NOT NULL DEFAULT '',
    "mappedPlos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CourseSpecAssessmentItem_pkey" PRIMARY KEY ("courseSpecId","id")
);

-- CreateTable
CREATE TABLE "CourseSpecMappingCell" (
    "courseSpecId" TEXT NOT NULL,
    "cloCode" TEXT NOT NULL,
    "kind" "MappingComponentKind" NOT NULL,
    "ref" TEXT NOT NULL,
    "strength" INTEGER NOT NULL,

    CONSTRAINT "CourseSpecMappingCell_pkey" PRIMARY KEY ("courseSpecId","cloCode","kind","ref")
);

-- AddForeignKey
ALTER TABLE "CourseSpecWeek" ADD CONSTRAINT "CourseSpecWeek_courseSpecId_fkey" FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSpecAssessmentItem" ADD CONSTRAINT "CourseSpecAssessmentItem_courseSpecId_fkey" FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSpecMappingCell" ADD CONSTRAINT "CourseSpecMappingCell_courseSpecId_fkey" FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (issue #103): explode every `slt` section's `content.weeks` array into
-- CourseSpecWeek rows, preserving array position as `order`. Confirmed against both
-- local dev and production that every existing `slt` row uses the *legacy*
-- pre-L/T/P/O shape (`{"contactHours": n, "selfStudyHours": n}`, no
-- lectureHours/tutorialHours/practiceHours/otherHours breakdown) — this is the
-- common case today, not an edge case. `has_breakdown` replicates
-- weekly-plan-model.ts's `toWeeklyPlanForm` exactly: fold `contactHours` into
-- `lectureHours` only when none of the four breakdown fields is present, so a
-- pre-existing week's total isn't silently zeroed. `lloItems` defaults to `{}`
-- since the legacy shape never had that field. A row with no `weeks` key (the even
-- older, retired §16 mode/activity grid) contributes zero rows here, same as
-- `toWeeklyPlanForm` "yielding an empty plan" for that shape.
INSERT INTO "CourseSpecWeek" (
    "id", "courseSpecId", "order", "week", "topic", "cloCodes", "lloItems", "activities",
    "lectureHours", "tutorialHours", "practiceHours", "otherHours", "selfStudyHours", "assessment"
)
SELECT
    COALESCE(NULLIF(w->>'id', ''), gen_random_uuid()::text),
    cs."courseSpecId",
    (w_ord - 1)::int,
    COALESCE(NULLIF(w->>'week', '')::int, 1),
    COALESCE(w->>'topic', ''),
    COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(w->'cloCodes') v), ARRAY[]::text[]),
    COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(w->'lloItems') v), ARRAY[]::text[]),
    COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(w->'activities') v), ARRAY[]::text[]),
    CASE WHEN hb.has_breakdown THEN NULLIF(w->>'lectureHours', '')::float8 ELSE NULLIF(w->>'contactHours', '')::float8 END,
    CASE WHEN hb.has_breakdown THEN NULLIF(w->>'tutorialHours', '')::float8 ELSE NULL END,
    CASE WHEN hb.has_breakdown THEN NULLIF(w->>'practiceHours', '')::float8 ELSE NULL END,
    CASE WHEN hb.has_breakdown THEN NULLIF(w->>'otherHours', '')::float8 ELSE NULL END,
    NULLIF(w->>'selfStudyHours', '')::float8,
    COALESCE(w->>'assessment', '')
FROM "CourseSpecSection" cs
CROSS JOIN LATERAL jsonb_array_elements(cs."content"->'weeks') WITH ORDINALITY AS t(w, w_ord)
CROSS JOIN LATERAL (
    SELECT (w->>'lectureHours') IS NOT NULL OR (w->>'tutorialHours') IS NOT NULL
        OR (w->>'practiceHours') IS NOT NULL OR (w->>'otherHours') IS NOT NULL AS has_breakdown
) hb
WHERE cs."sectionKey" = 'slt'
ON CONFLICT ("courseSpecId", "id") DO NOTHING;

-- Backfill (issue #103): explode every `assessmentPlan` section's `content.items`
-- array into CourseSpecAssessmentItem rows, same array-position-as-`order` pattern.
INSERT INTO "CourseSpecAssessmentItem" (
    "id", "courseSpecId", "order", "name", "type", "description", "mode", "status",
    "cloCodes", "bloomLevel", "weight", "dueWeek", "durationWeeks", "format",
    "submissionMethod", "instructions", "rubric", "mappedPlos", "notes"
)
SELECT
    COALESCE(NULLIF(item->>'id', ''), gen_random_uuid()::text),
    cs."courseSpecId",
    (item_ord - 1)::int,
    COALESCE(item->>'name', ''),
    COALESCE(NULLIF(item->>'type', ''), 'Assignment'),
    COALESCE(item->>'description', ''),
    CASE WHEN item->>'mode' = 'group' THEN 'Group'::"AssessmentItemMode" ELSE 'Individual'::"AssessmentItemMode" END,
    CASE WHEN item->>'status' = 'inactive' THEN 'Inactive'::"AssessmentItemStatus" ELSE 'Active'::"AssessmentItemStatus" END,
    COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(item->'cloCodes') v), ARRAY[]::text[]),
    item->>'bloomLevel',
    NULLIF(item->>'weight', '')::float8,
    NULLIF(item->>'dueWeek', '')::int,
    NULLIF(item->>'durationWeeks', '')::float8,
    COALESCE(item->>'format', ''),
    COALESCE(item->>'submissionMethod', ''),
    COALESCE(item->>'instructions', ''),
    COALESCE(item->>'rubric', ''),
    COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(item->'mappedPlos') v), ARRAY[]::text[]),
    COALESCE(item->>'notes', '')
FROM "CourseSpecSection" cs
CROSS JOIN LATERAL jsonb_array_elements(cs."content"->'items') WITH ORDINALITY AS t(item, item_ord)
WHERE cs."sectionKey" = 'assessmentPlan'
ON CONFLICT ("courseSpecId", "id") DO NOTHING;

-- Backfill (issue #103): explode every `mapping` section's sparse `content.cells`
-- array into CourseSpecMappingCell rows. No synthesized id — `(cloCode, kind, ref)`
-- is already the cell's natural unique identity, so ON CONFLICT DO NOTHING is the
-- dedupe guard for any historical duplicate triple.
INSERT INTO "CourseSpecMappingCell" ("courseSpecId", "cloCode", "kind", "ref", "strength")
SELECT
    cs."courseSpecId",
    cell->>'cloCode',
    CASE WHEN cell->>'kind' = 'assessment' THEN 'Assessment'::"MappingComponentKind" ELSE 'Week'::"MappingComponentKind" END,
    cell->>'ref',
    COALESCE(NULLIF(cell->>'strength', '')::int, 0)
FROM "CourseSpecSection" cs
CROSS JOIN LATERAL jsonb_array_elements(cs."content"->'cells') AS cell
WHERE cs."sectionKey" = 'mapping'
    AND cell->>'cloCode' IS NOT NULL
    AND cell->>'ref' IS NOT NULL
ON CONFLICT ("courseSpecId", "cloCode", "kind", "ref") DO NOTHING;

-- Fold the retired §15 `cloMapping` section (CLAUDE.md's "dead cloMapping JSON
-- blob") into CourseSpecClo, replicating clo-model.ts's `toClosForm` exactly: match
-- by the CLO's derived code (`CLO${order+1}`, since `code` itself isn't stored),
-- and only fill a field the CLO doesn't already carry its own value for.
-- `assessmentMethodIds`/`focus`/`focusPercent` are intentionally never folded — the
-- live frontend shim doesn't fold them either (focus/focusPercent are derived, not
-- stored; assessmentMethodIds from the legacy shape is simply dropped) — so this
-- matches current behavior rather than inventing new behavior. A legacy item whose
-- `cloCode` has no matching CourseSpecClo row (the CLO was since deleted) is
-- silently skipped, same as the frontend shim, which can't fold into a CLO that no
-- longer exists either.
UPDATE "CourseSpecClo" clo
SET "sltHours" = NULLIF(legacy_item->>'sltHours', '')::int
FROM "CourseSpecSection" cs
CROSS JOIN LATERAL jsonb_array_elements(cs."content"->'items') AS legacy_item
WHERE cs."sectionKey" = 'cloMapping'
    AND cs."courseSpecId" = clo."courseSpecId"
    AND legacy_item->>'cloCode' = 'CLO' || (clo."order" + 1)
    AND clo."sltHours" IS NULL
    AND legacy_item->>'sltHours' IS NOT NULL;

INSERT INTO "CourseSpecCloTeachingMethod" ("courseSpecId", "cloId", "teachingMethodId")
SELECT DISTINCT clo."courseSpecId", clo."id", tm."id"
FROM "CourseSpecSection" cs
CROSS JOIN LATERAL jsonb_array_elements(cs."content"->'items') AS legacy_item
JOIN "CourseSpecClo" clo ON clo."courseSpecId" = cs."courseSpecId"
    AND legacy_item->>'cloCode' = 'CLO' || (clo."order" + 1)
CROSS JOIN LATERAL jsonb_array_elements_text(legacy_item->'teachingMethodIds') AS tmid(id)
JOIN "TeachingMethod" tm ON tm."id" = tmid.id
WHERE cs."sectionKey" = 'cloMapping'
    AND NOT EXISTS (
        SELECT 1 FROM "CourseSpecCloTeachingMethod" existing
        WHERE existing."courseSpecId" = clo."courseSpecId" AND existing."cloId" = clo."id"
    )
ON CONFLICT DO NOTHING;

-- `cloMapping` is not a registered SpecSectionId and has no read path left once the
-- fold above runs — these rows are fully obsolete, so delete them rather than leave
-- them as permanent dead weight ahead of phase C dropping `content` outright.
DELETE FROM "CourseSpecSection" WHERE "sectionKey" = 'cloMapping';

-- Matches the RLS convention every other CourseSpec* table already follows
-- (20260801080001_enable_rls_missing_tables): flagged by the Supabase security
-- advisor as publicly exposed via PostgREST with no RLS; the app itself connects as
-- the `postgres` role (rolbypassrls = true) so this doesn't affect app access.
ALTER TABLE "CourseSpecWeek" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSpecAssessmentItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSpecMappingCell" ENABLE ROW LEVEL SECURITY;
