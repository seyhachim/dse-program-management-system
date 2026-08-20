-- Issue #457 correctness follow-up: approval and effective date are distinct.
-- A future grading-scale revision may already be Approved while the predecessor
-- remains the policy applicable to CourseSpecs whose effective date (or today's
-- date for an undated draft) is still inside the predecessor's interval.

CREATE OR REPLACE FUNCTION "default_new_course_spec_grading_scale"()
RETURNS TRIGGER AS $$
DECLARE
  course_programme_id TEXT;
  selected_version_id TEXT;
  target_date DATE;
BEGIN
  IF NEW."gradingScaleVersionId" IS NOT NULL
    OR NEW."basedOnVersionId" IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT "programmeId" INTO course_programme_id
  FROM "Course"
  WHERE "id" = NEW."courseId";

  target_date := COALESCE(NEW."effectiveFrom"::date, CURRENT_DATE);

  SELECT v."id" INTO selected_version_id
  FROM "ProgrammeGradingScaleVersion" v
  JOIN "ProgrammeGradingScale" s ON s."id" = v."gradingScaleId"
  WHERE s."programmeId" = course_programme_id
    AND s."isDefault" = true
    AND v."status" IN ('Approved', 'Superseded')
    AND (v."effectiveFrom" IS NULL OR v."effectiveFrom" <= target_date)
    AND (v."effectiveTo" IS NULL OR target_date < v."effectiveTo")
  ORDER BY
    v."effectiveFrom" DESC NULLS LAST,
    v."version" DESC
  LIMIT 1;

  IF selected_version_id IS NOT NULL THEN
    NEW."gradingScaleVersionId" := selected_version_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "protect_course_spec_grading_scale_binding"()
RETURNS TRIGGER AS $$
DECLARE
  course_programme_id TEXT;
  scale_programme_id TEXT;
  scale_status "ProgrammeGradingScaleVersionStatus";
  scale_effective_from DATE;
  scale_effective_to DATE;
  selected_version_id TEXT;
  entering_review BOOLEAN;
  target_date DATE;
BEGIN
  entering_review := NEW."reviewStatus" IN ('Submitted', 'Resubmitted', 'UnderReview', 'Approved')
    AND (
      TG_OP = 'INSERT'
      OR OLD."reviewStatus" IN ('Draft', 'ChangesRequested')
    );

  IF TG_OP = 'INSERT'
    AND NEW."gradingScaleVersionId" IS NULL
    AND NEW."basedOnVersionId" IS NOT NULL
  THEN
    SELECT "gradingScaleVersionId" INTO selected_version_id
    FROM "CourseSpec"
    WHERE "id" = NEW."basedOnVersionId";
    NEW."gradingScaleVersionId" := selected_version_id;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD."reviewStatus" NOT IN ('Draft', 'ChangesRequested')
    AND NEW."gradingScaleVersionId" IS DISTINCT FROM OLD."gradingScaleVersionId"
  THEN
    RAISE EXCEPTION 'CourseSpec grading-scale binding is immutable after submission';
  END IF;

  SELECT "programmeId" INTO course_programme_id
  FROM "Course"
  WHERE "id" = NEW."courseId";

  target_date := COALESCE(NEW."effectiveFrom"::date, CURRENT_DATE);

  IF entering_review AND NEW."gradingScaleVersionId" IS NULL THEN
    SELECT v."id" INTO selected_version_id
    FROM "ProgrammeGradingScaleVersion" v
    JOIN "ProgrammeGradingScale" s ON s."id" = v."gradingScaleId"
    WHERE s."programmeId" = course_programme_id
      AND s."isDefault" = true
      AND v."status" IN ('Approved', 'Superseded')
      AND (v."effectiveFrom" IS NULL OR v."effectiveFrom" <= target_date)
      AND (v."effectiveTo" IS NULL OR target_date < v."effectiveTo")
    ORDER BY
      v."effectiveFrom" DESC NULLS LAST,
      v."version" DESC
    LIMIT 1;

    IF selected_version_id IS NULL THEN
      RAISE EXCEPTION 'CourseSpec submission requires an applicable approved default programme grading scale';
    END IF;
    NEW."gradingScaleVersionId" := selected_version_id;
  END IF;

  IF NEW."gradingScaleVersionId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s."programmeId", v."status", v."effectiveFrom", v."effectiveTo"
    INTO scale_programme_id, scale_status, scale_effective_from, scale_effective_to
  FROM "ProgrammeGradingScaleVersion" v
  JOIN "ProgrammeGradingScale" s ON s."id" = v."gradingScaleId"
  WHERE v."id" = NEW."gradingScaleVersionId";

  IF scale_programme_id IS NULL THEN
    RAISE EXCEPTION 'CourseSpec grading-scale version does not exist';
  END IF;
  IF scale_programme_id <> course_programme_id THEN
    RAISE EXCEPTION 'CourseSpec grading scale must belong to the same programme as the course';
  END IF;
  IF scale_status NOT IN ('Approved', 'Superseded') THEN
    RAISE EXCEPTION 'CourseSpec can only bind to an approved grading-scale version';
  END IF;

  -- Validate applicability only on the first transition into review. After that,
  -- the exact binding is historical evidence and must stay valid even when a
  -- later policy revision becomes effective before review/approval finishes.
  IF entering_review THEN
    IF scale_effective_from IS NOT NULL AND target_date < scale_effective_from THEN
      RAISE EXCEPTION 'CourseSpec effective date precedes its grading-scale version';
    END IF;
    IF scale_effective_to IS NOT NULL AND target_date >= scale_effective_to THEN
      RAISE EXCEPTION 'CourseSpec effective date falls after its grading-scale version was superseded';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL PRIVILEGES ON FUNCTION "default_new_course_spec_grading_scale"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "protect_course_spec_grading_scale_binding"() FROM PUBLIC;

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
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I() FROM %I',
      'protect_course_spec_grading_scale_binding',
      api_role
    );
  END LOOP;
END
$$;
