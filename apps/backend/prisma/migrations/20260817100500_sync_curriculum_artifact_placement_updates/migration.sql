-- Keep the curriculum artifact's placement-owned location/credit snapshot aligned
-- when the existing Draft curriculum editor moves/reorders/changes credits.
-- Alternative pathway-only rows have placementId = NULL and are unaffected.

CREATE OR REPLACE FUNCTION curriculum_artifact."sync_updated_placement"()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE curriculum_artifact."CourseSnapshot"
  SET "yearLevel" = NEW."yearLevel",
      "semester" = NEW."semester",
      "sortOrder" = NEW."sortOrder",
      "creditsTotal" = NEW."creditsSnapshot",
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "placementId" = NEW."id";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumCourse_sync_artifact"
AFTER UPDATE OF "yearLevel", "semester", "sortOrder", "creditsSnapshot"
ON public."ProgrammeCurriculumCourse"
FOR EACH ROW EXECUTE FUNCTION curriculum_artifact."sync_updated_placement"();

REVOKE ALL PRIVILEGES ON FUNCTION curriculum_artifact."sync_updated_placement"() FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION curriculum_artifact."sync_updated_placement"() FROM %I',
      api_role
    );
  END LOOP;
END $$;
