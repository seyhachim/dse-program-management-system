-- Issue #320: bind each curriculum placement to one exact approved CourseSpec version.
-- Existing placements are deliberately NOT guessed/backfilled. They remain NULL
-- until an authorized Head/Admin selects the intended approved version. This
-- preserves provenance when legacy curricula predate academic CourseSpec versions.

ALTER TABLE "ProgrammeCurriculumCourse"
  ADD COLUMN "courseSpecVersionId" TEXT;

ALTER TABLE "ProgrammeCurriculumCourse"
  ADD CONSTRAINT "ProgrammeCurriculumCourse_courseSpecVersionId_fkey"
  FOREIGN KEY ("courseSpecVersionId") REFERENCES "CourseSpec"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ProgrammeCurriculumCourse_courseSpecVersionId_idx"
  ON "ProgrammeCurriculumCourse"("courseSpecVersionId");

-- A binding is valid only when the CourseSpec belongs to the placement's course
-- and is already Approved. Draft/Submitted/UnderReview/ChangesRequested/
-- Resubmitted specs can never become curriculum evidence by direct SQL either.
-- When a new curriculum revision clones placements, inherit the predecessor's
-- exact binding automatically; it never follows a later CourseSpec revision.
CREATE OR REPLACE FUNCTION "validate_programme_curriculum_course_spec_binding"()
RETURNS TRIGGER AS $$
DECLARE
  predecessor_version_id TEXT;
  predecessor_binding_id TEXT;
  bound_course_id TEXT;
  bound_review_status "CourseSpecReviewStatus";
BEGIN
  IF TG_OP = 'INSERT' AND NEW."courseSpecVersionId" IS NULL THEN
    SELECT "basedOnVersionId"
      INTO predecessor_version_id
      FROM "ProgrammeCurriculumVersion"
      WHERE "id" = NEW."curriculumVersionId";

    IF predecessor_version_id IS NOT NULL THEN
      SELECT "courseSpecVersionId"
        INTO predecessor_binding_id
        FROM "ProgrammeCurriculumCourse"
        WHERE "curriculumVersionId" = predecessor_version_id
          AND "courseId" = NEW."courseId";
      NEW."courseSpecVersionId" := predecessor_binding_id;
    END IF;
  END IF;

  IF NEW."courseSpecVersionId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "courseId", "reviewStatus"
    INTO bound_course_id, bound_review_status
    FROM "CourseSpec"
    WHERE "id" = NEW."courseSpecVersionId";

  IF bound_course_id IS NULL THEN
    RAISE EXCEPTION 'Bound CourseSpec version does not exist';
  END IF;

  IF bound_course_id <> NEW."courseId" THEN
    RAISE EXCEPTION 'CourseSpec version must belong to the curriculum placement course';
  END IF;

  IF bound_review_status <> 'Approved' THEN
    RAISE EXCEPTION 'Only an Approved CourseSpec version can be bound to a curriculum placement';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumCourse_validate_course_spec_binding"
BEFORE INSERT OR UPDATE OF "courseSpecVersionId", "courseId", "curriculumVersionId"
ON "ProgrammeCurriculumCourse"
FOR EACH ROW
EXECUTE FUNCTION "validate_programme_curriculum_course_spec_binding"();

-- Activation is fail-closed. Approved curriculum rows stay immutable; if an old
-- Approved curriculum has missing bindings, create a new curriculum revision,
-- bind its placements, review it, and activate that revision instead of mutating
-- the historical Approved snapshot.
CREATE OR REPLACE FUNCTION "require_curriculum_course_specs_before_activation"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" = 'Active' AND OLD."status" IS DISTINCT FROM 'Active' THEN
    IF EXISTS (
      SELECT 1
      FROM "ProgrammeCurriculumCourse" placement
      LEFT JOIN "CourseSpec" spec
        ON spec."id" = placement."courseSpecVersionId"
      WHERE placement."curriculumVersionId" = NEW."id"
        AND (
          placement."courseSpecVersionId" IS NULL
          OR spec."id" IS NULL
          OR spec."courseId" <> placement."courseId"
          OR spec."reviewStatus" <> 'Approved'
        )
    ) THEN
      RAISE EXCEPTION 'Every curriculum placement must bind an Approved CourseSpec version before activation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumVersion_require_course_specs_for_activation"
BEFORE UPDATE OF "status" ON "ProgrammeCurriculumVersion"
FOR EACH ROW
EXECUTE FUNCTION "require_curriculum_course_specs_before_activation"();
