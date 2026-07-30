-- CreateTable
CREATE TABLE "RubricLevel" (
    "id" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "RubricLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricCriterion" (
    "id" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "RubricCriterion_pkey" PRIMARY KEY ("rubricId","id")
);

-- CreateTable
CREATE TABLE "RubricCell" (
    "rubricId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "descriptor" TEXT NOT NULL,

    CONSTRAINT "RubricCell_pkey" PRIMARY KEY ("rubricId","criterionId","levelId")
);

-- CreateIndex
CREATE INDEX "RubricLevel_rubricId_idx" ON "RubricLevel"("rubricId");

-- CreateIndex
CREATE INDEX "RubricCriterion_name_idx" ON "RubricCriterion"("name");

-- AddForeignKey
ALTER TABLE "RubricLevel" ADD CONSTRAINT "RubricLevel_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricCriterion" ADD CONSTRAINT "RubricCriterion_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricCell" ADD CONSTRAINT "RubricCell_rubricId_criterionId_fkey" FOREIGN KEY ("rubricId", "criterionId") REFERENCES "RubricCriterion"("rubricId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricCell" ADD CONSTRAINT "RubricCell_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "RubricLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (issue #80 phase A): decompose every existing Rubric.levels/criteria
-- jsonb array into the normalized tables above. Runs as part of this migration
-- (not a standalone script) so it's atomic with the DDL and actually executes
-- on Render's `prisma migrate deploy` deploy step. RubricLevel.id is synthesized
-- (the jsonb form has no id); RubricCriterion.id is preserved from the jsonb
-- criterion's own `id` field, since the frontend keys edit-form rows on it —
-- but that id is only unique within a rubric (seeded rubrics reuse short ids
-- like "c1" across different rubrics), hence the (rubricId, id) composite key.
-- RubricCell rows are only inserted where both a level and a same-index
-- descriptor exist, so a criterion with fewer descriptors than levels (none
-- currently in prod, verified before writing this migration) backfills
-- partially instead of erroring.
WITH level_ins AS (
    INSERT INTO "RubricLevel" ("id", "rubricId", "label", "points", "order")
    SELECT gen_random_uuid()::text, r."id", (lvl->>'label'), (lvl->>'points')::float8, (lvl_ord - 1)::int
    FROM "Rubric" r
    CROSS JOIN LATERAL jsonb_array_elements(r."levels") WITH ORDINALITY AS t(lvl, lvl_ord)
    RETURNING "id", "rubricId", "order"
),
criterion_ins AS (
    INSERT INTO "RubricCriterion" ("id", "rubricId", "name", "order")
    SELECT (crit->>'id'), r."id", (crit->>'name'), (crit_ord - 1)::int
    FROM "Rubric" r
    CROSS JOIN LATERAL jsonb_array_elements(r."criteria") WITH ORDINALITY AS t(crit, crit_ord)
    RETURNING "id", "rubricId", "order"
)
INSERT INTO "RubricCell" ("rubricId", "criterionId", "levelId", "descriptor")
SELECT ci."rubricId", ci."id", lv."id", dsc.descriptor
FROM "Rubric" r
CROSS JOIN LATERAL jsonb_array_elements(r."criteria") WITH ORDINALITY AS crit(c, crit_ord)
CROSS JOIN LATERAL jsonb_array_elements_text(c->'descriptors') WITH ORDINALITY AS dsc(descriptor, dsc_ord)
JOIN criterion_ins ci ON ci."rubricId" = r."id" AND ci."order" = crit_ord - 1
JOIN level_ins lv ON lv."rubricId" = r."id" AND lv."order" = dsc_ord - 1;
