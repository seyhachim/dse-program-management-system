-- Issue #132: preserve assessment/rubric referential history even if a delete
-- bypasses the application service. The existing FK uses ON DELETE SET NULL for
-- deploy compatibility, so add a database guard that refuses to erase a rubric
-- while any CourseSpecAssessmentItem still references it.

CREATE OR REPLACE FUNCTION public."prevent_linked_rubric_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."CourseSpecAssessmentItem"
    WHERE "rubricId" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'Cannot delete a rubric that is linked to an assessment'
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public."prevent_linked_rubric_delete"() FROM PUBLIC;

CREATE TRIGGER "Rubric_prevent_linked_delete"
BEFORE DELETE ON public."Rubric"
FOR EACH ROW
EXECUTE FUNCTION public."prevent_linked_rubric_delete"();
