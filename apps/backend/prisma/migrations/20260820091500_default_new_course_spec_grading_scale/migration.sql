-- Issue #457 UX/data consistency: a new first-version CourseSpec may preview §24
-- immediately using the current Approved default programme policy. The binding is
-- still editable while Draft/ChangesRequested and becomes immutable at submission.
-- Revisions with basedOnVersionId are excluded here so they continue inheriting
-- their predecessor's exact historical binding in the main integrity trigger.

CREATE OR REPLACE FUNCTION "default_new_course_spec_grading_scale"()
RETURNS TRIGGER AS $$
DECLARE
  course_programme_id TEXT;
  selected_version_id TEXT;
BEGIN
  IF NEW."gradingScaleVersionId" IS NOT NULL
    OR NEW."basedOnVersionId" IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT "programmeId" INTO course_programme_id
  FROM "Course"
  WHERE "id" = NEW."courseId";

  SELECT v."id" INTO selected_version_id
  FROM "ProgrammeGradingScaleVersion" v
  JOIN "ProgrammeGradingScale" s ON s."id" = v."gradingScaleId"
  WHERE s."programmeId" = course_programme_id
    AND s."isDefault" = true
    AND v."status" = 'Approved'
  ORDER BY v."version" DESC
  LIMIT 1;

  IF selected_version_id IS NOT NULL THEN
    NEW."gradingScaleVersionId" := selected_version_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CourseSpec_00_default_grading_scale_on_insert"
BEFORE INSERT ON "CourseSpec"
FOR EACH ROW
EXECUTE FUNCTION "default_new_course_spec_grading_scale"();

REVOKE ALL PRIVILEGES ON FUNCTION "default_new_course_spec_grading_scale"() FROM PUBLIC;

DO $$
DECLARE
  api_role TEXT;
BEGIN
  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I() FROM %I',
      'default_new_course_spec_grading_scale',
      api_role
    );
  END LOOP;
END
$$;
