-- Issue #81 phase C: drop the jsonb CourseSpec.data/status columns. Phase A/B
-- (20260731065456_normalize_coursespec_sections, #91) added CourseSpecSection/
-- CourseSpecClo/CourseSpecCloTeachingMethod/CourseSpecCloAssessmentMethod and
-- backfilled every existing course spec into them, then cut courseService's
-- reads and writes over to those tables — nothing has read or written these
-- columns since.
ALTER TABLE "CourseSpec" DROP COLUMN "data",
DROP COLUMN "status";
