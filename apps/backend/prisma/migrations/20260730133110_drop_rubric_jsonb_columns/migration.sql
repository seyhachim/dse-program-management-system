-- Issue #80 phase C: drop the jsonb Rubric.levels/criteria columns. Phase A
-- (20260730161400_normalize_rubric_tables) added RubricLevel/RubricCriterion/
-- RubricCell and backfilled every existing rubric into them; phase B cut
-- rubricService's reads over to those tables, so nothing has read these
-- columns since. Every write path (rubricService.create/update, seed.ts) has
-- also stopped writing them.
ALTER TABLE "Rubric" DROP COLUMN "criteria",
DROP COLUMN "levels";
