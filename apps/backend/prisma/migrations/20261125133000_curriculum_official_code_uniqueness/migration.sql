-- #1347: one official course code per curriculum version, across all pathways.
-- Preserve canonical Course.code uniqueness and all historical snapshot values.
-- Abort rather than silently repair pre-existing duplicates.
BEGIN;
LOCK TABLE curriculum_artifact."CourseSnapshot" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM curriculum_artifact."CourseSnapshot"
    GROUP BY "curriculumVersionId", "courseCodeSnapshot"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate official course codes exist within a curriculum version; review historical data before applying #1347';
  END IF;
END;
$$;
ALTER TABLE curriculum_artifact."CourseSnapshot"
  ADD CONSTRAINT "CourseSnapshot_version_official_code_key"
  UNIQUE ("curriculumVersionId", "courseCodeSnapshot")
  DEFERRABLE INITIALLY IMMEDIATE;
-- The stronger constraint subsumes scope-level uniqueness. Drop the redundant
-- immediate index so an import can defer intermediate trigger-generated codes.
DROP INDEX curriculum_artifact."CourseSnapshot_version_scope_code_key";
COMMIT;
