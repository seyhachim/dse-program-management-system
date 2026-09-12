-- Issue #812: version the existing programme competency/PLO design context and
-- bind it to exact curriculum versions. Existing ProgramCompetency/PLO rows remain
-- the current authoring catalogue; these tables are immutable historical snapshots.

CREATE TABLE "ProgrammeCompetencyFramework" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeCompetencyFramework_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeCompetencyFramework_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "Programme"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProgrammeCompetencyFrameworkVersion" (
  "id" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "changeNote" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeCompetencyFrameworkVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeCompetencyFrameworkVersion_version_check" CHECK ("version" >= 1),
  CONSTRAINT "ProgrammeCompetencyFrameworkVersion_frameworkId_fkey"
    FOREIGN KEY ("frameworkId") REFERENCES "ProgrammeCompetencyFramework"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeCompetencyFrameworkVersion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProgrammeCompetencyFrameworkCompetency" (
  "id" TEXT NOT NULL,
  "frameworkVersionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "order" INTEGER NOT NULL,
  "sourceActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "ploCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeCompetencyFrameworkCompetency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeCompetencyFrameworkCompetency_order_check" CHECK ("order" >= 0),
  CONSTRAINT "ProgrammeCompetencyFrameworkCompetency_frameworkVersionId_fkey"
    FOREIGN KEY ("frameworkVersionId") REFERENCES "ProgrammeCompetencyFrameworkVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProgrammeCompetencyFramework_programmeId_code_key"
  ON "ProgrammeCompetencyFramework"("programmeId", "code");
CREATE INDEX "ProgrammeCompetencyFramework_programmeId_idx"
  ON "ProgrammeCompetencyFramework"("programmeId");
CREATE UNIQUE INDEX "ProgrammeCompetencyFrameworkVersion_frameworkId_version_key"
  ON "ProgrammeCompetencyFrameworkVersion"("frameworkId", "version");
CREATE INDEX "ProgrammeCompetencyFrameworkVersion_frameworkId_idx"
  ON "ProgrammeCompetencyFrameworkVersion"("frameworkId");
CREATE INDEX "ProgrammeCompetencyFrameworkVersion_createdById_idx"
  ON "ProgrammeCompetencyFrameworkVersion"("createdById");
CREATE UNIQUE INDEX "ProgrammeCompetencyFrameworkCompetency_frameworkVersionId_code_key"
  ON "ProgrammeCompetencyFrameworkCompetency"("frameworkVersionId", "code");
CREATE UNIQUE INDEX "ProgrammeCompetencyFrameworkCompetency_frameworkVersionId_order_key"
  ON "ProgrammeCompetencyFrameworkCompetency"("frameworkVersionId", "order");
CREATE INDEX "ProgrammeCompetencyFrameworkCompetency_frameworkVersionId_idx"
  ON "ProgrammeCompetencyFrameworkCompetency"("frameworkVersionId");

ALTER TABLE "ProgrammeCurriculumVersion"
  ADD COLUMN "competencyFrameworkVersionId" TEXT,
  ADD COLUMN "competencyFrameworkAssignedById" TEXT,
  ADD COLUMN "competencyFrameworkAssignedAt" TIMESTAMP(3);

ALTER TABLE "ProgrammeCurriculumVersion"
  ADD CONSTRAINT "ProgrammeCurriculumVersion_competencyFrameworkVersionId_fkey"
  FOREIGN KEY ("competencyFrameworkVersionId") REFERENCES "ProgrammeCompetencyFrameworkVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammeCurriculumVersion"
  ADD CONSTRAINT "ProgrammeCurriculumVersion_competencyFrameworkAssignedById_fkey"
  FOREIGN KEY ("competencyFrameworkAssignedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ProgrammeCurriculumVersion_competencyFrameworkVersionId_idx"
  ON "ProgrammeCurriculumVersion"("competencyFrameworkVersionId");
CREATE INDEX "ProgrammeCurriculumVersion_competencyFrameworkAssignedById_idx"
  ON "ProgrammeCurriculumVersion"("competencyFrameworkAssignedById");

-- Framework identities and snapshots are append-only. A correction creates a new
-- framework version, preserving curriculum/SAR provenance.
CREATE OR REPLACE FUNCTION "protect_programme_competency_framework_history"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Programme competency framework history is immutable; create a new framework version';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCompetencyFramework_protect_history"
BEFORE UPDATE OR DELETE ON "ProgrammeCompetencyFramework"
FOR EACH ROW EXECUTE FUNCTION "protect_programme_competency_framework_history"();
CREATE TRIGGER "ProgrammeCompetencyFrameworkVersion_protect_history"
BEFORE UPDATE OR DELETE ON "ProgrammeCompetencyFrameworkVersion"
FOR EACH ROW EXECUTE FUNCTION "protect_programme_competency_framework_history"();
CREATE TRIGGER "ProgrammeCompetencyFrameworkCompetency_protect_history"
BEFORE UPDATE OR DELETE ON "ProgrammeCompetencyFrameworkCompetency"
FOR EACH ROW EXECUTE FUNCTION "protect_programme_competency_framework_history"();

-- Association is editable only while the curriculum is Draft and the framework
-- belongs to the same programme. This protects direct SQL as well as API writes.
CREATE OR REPLACE FUNCTION "validate_curriculum_competency_framework_assignment"()
RETURNS TRIGGER AS $$
DECLARE
  curriculum_programme_id TEXT;
  framework_programme_id TEXT;
BEGIN
  IF NEW."competencyFrameworkVersionId" IS NULL THEN
    IF NEW."competencyFrameworkAssignedById" IS NOT NULL
       OR NEW."competencyFrameworkAssignedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Competency framework provenance requires a framework version';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" <> 'Draft' THEN
    IF TG_OP = 'INSERT'
       OR NEW."competencyFrameworkVersionId" IS DISTINCT FROM OLD."competencyFrameworkVersionId"
       OR NEW."competencyFrameworkAssignedById" IS DISTINCT FROM OLD."competencyFrameworkAssignedById"
       OR NEW."competencyFrameworkAssignedAt" IS DISTINCT FROM OLD."competencyFrameworkAssignedAt" THEN
      RAISE EXCEPTION 'Competency framework assignment can only change on Draft curriculum versions';
    END IF;
  END IF;

  IF NEW."competencyFrameworkAssignedById" IS NULL OR NEW."competencyFrameworkAssignedAt" IS NULL THEN
    RAISE EXCEPTION 'Competency framework assignment requires actor and timestamp provenance';
  END IF;

  SELECT c."programmeId"
    INTO curriculum_programme_id
    FROM "ProgrammeCurriculum" c
    WHERE c."id" = NEW."curriculumId";

  SELECT f."programmeId"
    INTO framework_programme_id
    FROM "ProgrammeCompetencyFrameworkVersion" fv
    JOIN "ProgrammeCompetencyFramework" f ON f."id" = fv."frameworkId"
    WHERE fv."id" = NEW."competencyFrameworkVersionId";

  IF framework_programme_id IS NULL THEN
    RAISE EXCEPTION 'Competency framework version does not exist';
  END IF;
  IF curriculum_programme_id IS DISTINCT FROM framework_programme_id THEN
    RAISE EXCEPTION 'Competency framework and curriculum must belong to the same programme';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumVersion_validate_competency_framework"
BEFORE INSERT OR UPDATE OF "competencyFrameworkVersionId", "competencyFrameworkAssignedById", "competencyFrameworkAssignedAt"
ON "ProgrammeCurriculumVersion"
FOR EACH ROW EXECUTE FUNCTION "validate_curriculum_competency_framework_assignment"();

-- Keep new public tables on the backend-only access path.
DO $$
DECLARE
  table_name text;
  api_role text;
  framework_tables constant text[] := ARRAY[
    'ProgrammeCompetencyFramework',
    'ProgrammeCompetencyFrameworkVersion',
    'ProgrammeCompetencyFrameworkCompetency'
  ];
BEGIN
  FOREACH table_name IN ARRAY framework_tables LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC', 'public', table_name);
  END LOOP;
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    FOREACH table_name IN ARRAY framework_tables LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', 'public', table_name, api_role);
    END LOOP;
  END LOOP;
END
$$;
