-- Issue #813: exact curriculum-version course -> competency contribution map.
-- Teach / Use / Assess are independent dimensions, each at Basic / Intermediate / Advanced.

ALTER TYPE "ProgrammeCurriculumAuditActionType"
  ADD VALUE IF NOT EXISTS 'CompetencyMappingUpdated';
ALTER TYPE "ProgrammeCurriculumAuditActionType"
  ADD VALUE IF NOT EXISTS 'CompetencyMappingCleared';

CREATE TYPE "CurriculumCompetencyLevel" AS ENUM ('Basic', 'Intermediate', 'Advanced');

CREATE TABLE "ProgrammeCurriculumCourseCompetencyMapping" (
  "id" TEXT NOT NULL,
  "curriculumVersionId" TEXT NOT NULL,
  "curriculumCourseId" TEXT NOT NULL,
  "competencyId" TEXT NOT NULL,
  "teachLevel" "CurriculumCompetencyLevel",
  "useLevel" "CurriculumCompetencyLevel",
  "assessLevel" "CurriculumCompetencyLevel",
  "note" TEXT NOT NULL DEFAULT '',
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeCurriculumCourseCompetencyMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeCurriculumCourseCompetencyMapping_nonempty_check"
    CHECK ("teachLevel" IS NOT NULL OR "useLevel" IS NOT NULL OR "assessLevel" IS NOT NULL),
  CONSTRAINT "ProgrammeCurriculumCourseCompetencyMapping_curriculumVersionId_fkey"
    FOREIGN KEY ("curriculumVersionId") REFERENCES "ProgrammeCurriculumVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeCurriculumCourseCompetencyMapping_curriculumCourseId_fkey"
    FOREIGN KEY ("curriculumCourseId") REFERENCES "ProgrammeCurriculumCourse"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeCurriculumCourseCompetencyMapping_competencyId_fkey"
    FOREIGN KEY ("competencyId") REFERENCES "ProgrammeCompetencyFrameworkCompetency"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeCurriculumCourseCompetencyMapping_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProgrammeCurriculumCourseCompetencyMapping_version_course_competency_key"
  ON "ProgrammeCurriculumCourseCompetencyMapping"("curriculumVersionId", "curriculumCourseId", "competencyId");
CREATE INDEX "ProgrammeCurriculumCourseCompetencyMapping_curriculumVersionId_idx"
  ON "ProgrammeCurriculumCourseCompetencyMapping"("curriculumVersionId");
CREATE INDEX "ProgrammeCurriculumCourseCompetencyMapping_curriculumCourseId_idx"
  ON "ProgrammeCurriculumCourseCompetencyMapping"("curriculumCourseId");
CREATE INDEX "ProgrammeCurriculumCourseCompetencyMapping_competencyId_idx"
  ON "ProgrammeCurriculumCourseCompetencyMapping"("competencyId");
CREATE INDEX "ProgrammeCurriculumCourseCompetencyMapping_updatedById_idx"
  ON "ProgrammeCurriculumCourseCompetencyMapping"("updatedById");

-- Enforce exact-version and exact-framework integrity even for direct SQL writes.
CREATE OR REPLACE FUNCTION "validate_programme_curriculum_course_competency_mapping"()
RETURNS TRIGGER AS $$
DECLARE
  version_status TEXT;
  bound_framework_version_id TEXT;
  course_version_id TEXT;
  competency_framework_version_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT "status"::TEXT
      INTO version_status
      FROM "ProgrammeCurriculumVersion"
      WHERE "id" = OLD."curriculumVersionId";

    IF version_status IS DISTINCT FROM 'Draft' THEN
      RAISE EXCEPTION 'Course competency mappings can only change on Draft curriculum versions';
    END IF;
    RETURN OLD;
  END IF;

  SELECT "status"::TEXT, "competencyFrameworkVersionId"
    INTO version_status, bound_framework_version_id
    FROM "ProgrammeCurriculumVersion"
    WHERE "id" = NEW."curriculumVersionId";

  IF version_status IS NULL THEN
    RAISE EXCEPTION 'Curriculum version does not exist';
  END IF;
  IF version_status <> 'Draft' THEN
    RAISE EXCEPTION 'Course competency mappings can only change on Draft curriculum versions';
  END IF;
  IF bound_framework_version_id IS NULL THEN
    RAISE EXCEPTION 'Curriculum version must have a competency framework before mappings are recorded';
  END IF;

  SELECT "curriculumVersionId"
    INTO course_version_id
    FROM "ProgrammeCurriculumCourse"
    WHERE "id" = NEW."curriculumCourseId";

  IF course_version_id IS NULL THEN
    RAISE EXCEPTION 'Curriculum course placement does not exist';
  END IF;
  IF course_version_id IS DISTINCT FROM NEW."curriculumVersionId" THEN
    RAISE EXCEPTION 'Course competency mapping must reference a course in the same curriculum version';
  END IF;

  SELECT "frameworkVersionId"
    INTO competency_framework_version_id
    FROM "ProgrammeCompetencyFrameworkCompetency"
    WHERE "id" = NEW."competencyId";

  IF competency_framework_version_id IS NULL THEN
    RAISE EXCEPTION 'Competency snapshot row does not exist';
  END IF;
  IF competency_framework_version_id IS DISTINCT FROM bound_framework_version_id THEN
    RAISE EXCEPTION 'Course competency mapping must reference the curriculum-bound framework version';
  END IF;

  IF NEW."teachLevel" IS NULL
     AND NEW."useLevel" IS NULL
     AND NEW."assessLevel" IS NULL THEN
    RAISE EXCEPTION 'At least one Teach, Use, or Assess level is required';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumCourseCompetencyMapping_validate"
BEFORE INSERT OR UPDATE OR DELETE
ON "ProgrammeCurriculumCourseCompetencyMapping"
FOR EACH ROW EXECUTE FUNCTION "validate_programme_curriculum_course_competency_mapping"();

-- Do not silently invalidate existing map rows by rebinding a Draft curriculum
-- to a different framework. The user must deliberately clear/remap first.
CREATE OR REPLACE FUNCTION "guard_curriculum_framework_reassignment_with_mappings"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."competencyFrameworkVersionId" IS DISTINCT FROM OLD."competencyFrameworkVersionId"
     AND EXISTS (
       SELECT 1
       FROM "ProgrammeCurriculumCourseCompetencyMapping"
       WHERE "curriculumVersionId" = NEW."id"
     ) THEN
    RAISE EXCEPTION 'Clear existing course competency mappings before changing the competency framework version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumVersion_guard_framework_reassignment_with_mappings"
BEFORE UPDATE OF "competencyFrameworkVersionId"
ON "ProgrammeCurriculumVersion"
FOR EACH ROW EXECUTE FUNCTION "guard_curriculum_framework_reassignment_with_mappings"();

-- Keep the new public table on the same backend-only path as the other
-- programme/curriculum tables.
ALTER TABLE "ProgrammeCurriculumCourseCompetencyMapping" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ProgrammeCurriculumCourseCompetencyMapping" FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
      'public',
      'ProgrammeCurriculumCourseCompetencyMapping',
      api_role
    );
  END LOOP;
END
$$;
