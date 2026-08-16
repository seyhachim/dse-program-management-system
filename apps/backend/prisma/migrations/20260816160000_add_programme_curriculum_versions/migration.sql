-- Issue #314: additive programme-curriculum versioning foundation.
-- Existing Programme, Course, CourseSpec, offering, result, and QA rows are untouched.

CREATE TYPE "ProgrammeCurriculumStatus" AS ENUM (
  'Draft',
  'Approved',
  'Active',
  'Superseded'
);

CREATE TYPE "ProgrammeCurriculumRevisionType" AS ENUM (
  'Initial',
  'Minor',
  'Major'
);

CREATE TYPE "ProgrammeCurriculumRevisionTrigger" AS ENUM (
  'ScheduledReview',
  'StudentFeedback',
  'AlumniFeedback',
  'EmployerFeedback',
  'LecturerReflection',
  'ProgrammeCoordinator',
  'ExternalExaminer',
  'QaFinding',
  'RegulatoryChange',
  'Other'
);

CREATE TYPE "ProgrammeCurriculumAuditActionType" AS ENUM (
  'Created',
  'MetadataUpdated',
  'CourseAdded',
  'CourseUpdated',
  'CourseRemoved',
  'Approved',
  'Activated',
  'Superseded'
);

CREATE TABLE "ProgrammeCurriculum" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProgrammeCurriculum_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeCurriculum_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "Programme"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProgrammeCurriculumVersion" (
  "id" TEXT NOT NULL,
  "curriculumId" TEXT NOT NULL,
  "versionMajor" INTEGER NOT NULL DEFAULT 1,
  "versionMinor" INTEGER NOT NULL DEFAULT 0,
  "status" "ProgrammeCurriculumStatus" NOT NULL DEFAULT 'Draft',
  "revisionType" "ProgrammeCurriculumRevisionType" NOT NULL DEFAULT 'Initial',
  "revisionTriggers" "ProgrammeCurriculumRevisionTrigger"[] NOT NULL DEFAULT ARRAY[]::"ProgrammeCurriculumRevisionTrigger"[],
  "revisionReason" TEXT NOT NULL DEFAULT '',
  "changeSummary" TEXT NOT NULL DEFAULT '',
  "basedOnVersionId" TEXT,
  "cohortLabel" TEXT NOT NULL DEFAULT '',
  "intakeYear" INTEGER,
  "academicYear" TEXT NOT NULL DEFAULT '',
  "effectiveFrom" DATE,
  "approvedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProgrammeCurriculumVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeCurriculumVersion_versionMajor_check"
    CHECK ("versionMajor" >= 1),
  CONSTRAINT "ProgrammeCurriculumVersion_versionMinor_check"
    CHECK ("versionMinor" >= 0),
  CONSTRAINT "ProgrammeCurriculumVersion_not_own_predecessor_check"
    CHECK ("basedOnVersionId" IS NULL OR "basedOnVersionId" <> "id"),
  CONSTRAINT "ProgrammeCurriculumVersion_revision_metadata_check"
    CHECK (
      "revisionType" = 'Initial'
      OR (
        length(btrim("revisionReason")) > 0
        AND length(btrim("changeSummary")) > 0
      )
    ),
  CONSTRAINT "ProgrammeCurriculumVersion_curriculumId_fkey"
    FOREIGN KEY ("curriculumId") REFERENCES "ProgrammeCurriculum"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeCurriculumVersion_basedOnVersionId_fkey"
    FOREIGN KEY ("basedOnVersionId") REFERENCES "ProgrammeCurriculumVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeCurriculumVersion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProgrammeCurriculumCourse" (
  "id" TEXT NOT NULL,
  "curriculumVersionId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "yearLevel" INTEGER NOT NULL,
  "semester" "Semester" NOT NULL,
  "creditsSnapshot" INTEGER NOT NULL,
  "courseTypeSnapshot" "CourseType" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProgrammeCurriculumCourse_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeCurriculumCourse_yearLevel_check"
    CHECK ("yearLevel" BETWEEN 1 AND 4),
  CONSTRAINT "ProgrammeCurriculumCourse_creditsSnapshot_check"
    CHECK ("creditsSnapshot" >= 0),
  CONSTRAINT "ProgrammeCurriculumCourse_sortOrder_check"
    CHECK ("sortOrder" >= 0),
  CONSTRAINT "ProgrammeCurriculumCourse_curriculumVersionId_fkey"
    FOREIGN KEY ("curriculumVersionId") REFERENCES "ProgrammeCurriculumVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeCurriculumCourse_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProgrammeCurriculumAuditAction" (
  "id" TEXT NOT NULL,
  "curriculumVersionId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" "ProgrammeCurriculumAuditActionType" NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeCurriculumAuditAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeCurriculumAuditAction_curriculumVersionId_fkey"
    FOREIGN KEY ("curriculumVersionId") REFERENCES "ProgrammeCurriculumVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeCurriculumAuditAction_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProgrammeCurriculum_programmeId_code_key"
  ON "ProgrammeCurriculum"("programmeId", "code");
CREATE INDEX "ProgrammeCurriculum_programmeId_idx"
  ON "ProgrammeCurriculum"("programmeId");

CREATE UNIQUE INDEX "ProgrammeCurriculumVersion_curriculumId_versionMajor_versionMinor_key"
  ON "ProgrammeCurriculumVersion"("curriculumId", "versionMajor", "versionMinor");
CREATE INDEX "ProgrammeCurriculumVersion_curriculumId_status_idx"
  ON "ProgrammeCurriculumVersion"("curriculumId", "status");
CREATE INDEX "ProgrammeCurriculumVersion_basedOnVersionId_idx"
  ON "ProgrammeCurriculumVersion"("basedOnVersionId");
CREATE INDEX "ProgrammeCurriculumVersion_createdById_idx"
  ON "ProgrammeCurriculumVersion"("createdById");

-- A curriculum may retain multiple Approved historical versions, but only one
-- version can be the currently Active version at a time.
CREATE UNIQUE INDEX "ProgrammeCurriculumVersion_one_active_per_curriculum"
  ON "ProgrammeCurriculumVersion"("curriculumId")
  WHERE "status" = 'Active';

CREATE UNIQUE INDEX "ProgrammeCurriculumCourse_curriculumVersionId_courseId_key"
  ON "ProgrammeCurriculumCourse"("curriculumVersionId", "courseId");
CREATE INDEX "ProgrammeCurriculumCourse_courseId_idx"
  ON "ProgrammeCurriculumCourse"("courseId");
CREATE INDEX "ProgrammeCurriculumCourse_curriculumVersionId_yearLevel_semester_sortOrder_idx"
  ON "ProgrammeCurriculumCourse"("curriculumVersionId", "yearLevel", "semester", "sortOrder");

CREATE INDEX "ProgrammeCurriculumAuditAction_curriculumVersionId_createdAt_idx"
  ON "ProgrammeCurriculumAuditAction"("curriculumVersionId", "createdAt");
CREATE INDEX "ProgrammeCurriculumAuditAction_actorId_idx"
  ON "ProgrammeCurriculumAuditAction"("actorId");

-- A predecessor must belong to the same canonical curriculum. A plain FK alone
-- cannot express that cross-row invariant.
CREATE OR REPLACE FUNCTION "check_programme_curriculum_predecessor"()
RETURNS TRIGGER AS $$
DECLARE
  predecessor_curriculum_id TEXT;
BEGIN
  IF NEW."basedOnVersionId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "curriculumId"
    INTO predecessor_curriculum_id
    FROM "ProgrammeCurriculumVersion"
    WHERE "id" = NEW."basedOnVersionId";

  IF predecessor_curriculum_id IS NULL OR predecessor_curriculum_id <> NEW."curriculumId" THEN
    RAISE EXCEPTION 'Curriculum predecessor must belong to the same curriculum';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumVersion_predecessor_same_curriculum"
BEFORE INSERT OR UPDATE OF "basedOnVersionId", "curriculumId"
ON "ProgrammeCurriculumVersion"
FOR EACH ROW
EXECUTE FUNCTION "check_programme_curriculum_predecessor"();

-- Once a version is Approved, Active, or Superseded, its academic content and
-- revision provenance are immutable. Lifecycle status may still advance through
-- Approved -> Active -> Superseded in later workflow work.
CREATE OR REPLACE FUNCTION "protect_immutable_programme_curriculum_version"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" IN ('Approved', 'Active', 'Superseded') THEN
    IF NEW."curriculumId" IS DISTINCT FROM OLD."curriculumId"
      OR NEW."versionMajor" IS DISTINCT FROM OLD."versionMajor"
      OR NEW."versionMinor" IS DISTINCT FROM OLD."versionMinor"
      OR NEW."revisionType" IS DISTINCT FROM OLD."revisionType"
      OR NEW."revisionTriggers" IS DISTINCT FROM OLD."revisionTriggers"
      OR NEW."revisionReason" IS DISTINCT FROM OLD."revisionReason"
      OR NEW."changeSummary" IS DISTINCT FROM OLD."changeSummary"
      OR NEW."basedOnVersionId" IS DISTINCT FROM OLD."basedOnVersionId"
      OR NEW."cohortLabel" IS DISTINCT FROM OLD."cohortLabel"
      OR NEW."intakeYear" IS DISTINCT FROM OLD."intakeYear"
      OR NEW."academicYear" IS DISTINCT FROM OLD."academicYear"
      OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
      OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    THEN
      RAISE EXCEPTION 'Approved, Active, and Superseded curriculum versions are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumVersion_protect_immutable_fields"
BEFORE UPDATE ON "ProgrammeCurriculumVersion"
FOR EACH ROW
EXECUTE FUNCTION "protect_immutable_programme_curriculum_version"();

-- Placements are mutable only while their owning version is Draft. This protects
-- the historical credit/type snapshots from direct SQL/Prisma writes as well as
-- from normal service-layer mutation paths.
CREATE OR REPLACE FUNCTION "protect_immutable_programme_curriculum_course"()
RETURNS TRIGGER AS $$
DECLARE
  parent_version_id TEXT;
  parent_status "ProgrammeCurriculumStatus";
BEGIN
  parent_version_id := COALESCE(OLD."curriculumVersionId", NEW."curriculumVersionId");

  SELECT "status"
    INTO parent_status
    FROM "ProgrammeCurriculumVersion"
    WHERE "id" = parent_version_id;

  IF parent_status IN ('Approved', 'Active', 'Superseded') THEN
    RAISE EXCEPTION 'Cannot mutate course placements of an immutable curriculum version';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW."curriculumVersionId" <> OLD."curriculumVersionId" THEN
    SELECT "status"
      INTO parent_status
      FROM "ProgrammeCurriculumVersion"
      WHERE "id" = NEW."curriculumVersionId";

    IF parent_status IN ('Approved', 'Active', 'Superseded') THEN
      RAISE EXCEPTION 'Cannot move a placement into an immutable curriculum version';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumCourse_protect_immutable_parent"
BEFORE INSERT OR UPDATE OR DELETE ON "ProgrammeCurriculumCourse"
FOR EACH ROW
EXECUTE FUNCTION "protect_immutable_programme_curriculum_course"();

-- Audit actions are append-only. Corrections are represented by a new action;
-- prior academic/workflow history is never rewritten or deleted.
CREATE OR REPLACE FUNCTION "protect_programme_curriculum_audit_history"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Programme curriculum audit actions are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumAuditAction_append_only"
BEFORE UPDATE OR DELETE ON "ProgrammeCurriculumAuditAction"
FOR EACH ROW
EXECUTE FUNCTION "protect_programme_curriculum_audit_history"();
