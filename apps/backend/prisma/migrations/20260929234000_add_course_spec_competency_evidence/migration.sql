-- Issue #1203: CourseSpec competency expectations and explicit CLO evidence.
-- Programme T/U/A remains authoritative in the curriculum map; this table only
-- snapshots the expectation/provenance used by one exact CourseSpec version.

CREATE TABLE "CourseSpecCompetencyEvidence" (
  "id" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "competencyId" TEXT NOT NULL,
  "competencyCode" TEXT NOT NULL,
  "competencyName" TEXT NOT NULL,
  "sourceMappingId" TEXT,
  "sourceCurriculumVersionId" TEXT NOT NULL,
  "sourcePlacementId" TEXT NOT NULL,
  "sourceFrameworkVersionId" TEXT NOT NULL,
  "teachLevel" "CurriculumCompetencyLevel",
  "useLevel" "CurriculumCompetencyLevel",
  "assessLevel" "CurriculumCompetencyLevel",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSpecCompetencyEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseSpecCompetencyEvidence_courseSpecId_fkey"
    FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CourseSpecCompetencyEvidence_courseSpecId_competencyId_key"
  ON "CourseSpecCompetencyEvidence"("courseSpecId", "competencyId");
CREATE UNIQUE INDEX "CourseSpecCompetencyEvidence_id_courseSpecId_key"
  ON "CourseSpecCompetencyEvidence"("id", "courseSpecId");
CREATE INDEX "CourseSpecCompetencyEvidence_sourceCurriculumVersionId_idx"
  ON "CourseSpecCompetencyEvidence"("sourceCurriculumVersionId");
CREATE INDEX "CourseSpecCompetencyEvidence_sourcePlacementId_idx"
  ON "CourseSpecCompetencyEvidence"("sourcePlacementId");
CREATE INDEX "CourseSpecCompetencyEvidence_sourceFrameworkVersionId_idx"
  ON "CourseSpecCompetencyEvidence"("sourceFrameworkVersionId");
CREATE INDEX "CourseSpecCompetencyEvidence_sourceMappingId_idx"
  ON "CourseSpecCompetencyEvidence"("sourceMappingId");

CREATE TABLE "CourseSpecCompetencyEvidenceClo" (
  "evidenceId" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "cloId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSpecCompetencyEvidenceClo_pkey" PRIMARY KEY ("evidenceId", "cloId"),
  CONSTRAINT "CourseSpecCompetencyEvidenceClo_evidenceId_courseSpecId_fkey"
    FOREIGN KEY ("evidenceId", "courseSpecId")
    REFERENCES "CourseSpecCompetencyEvidence"("id", "courseSpecId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CourseSpecCompetencyEvidenceClo_courseSpecId_cloId_fkey"
    FOREIGN KEY ("courseSpecId", "cloId")
    REFERENCES "CourseSpecClo"("courseSpecId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CourseSpecCompetencyEvidenceClo_courseSpecId_cloId_idx"
  ON "CourseSpecCompetencyEvidenceClo"("courseSpecId", "cloId");

-- Defence in depth: direct SQL cannot mutate competency evidence once the
-- CourseSpec is outside its editable Draft / ChangesRequested workflow states.
CREATE OR REPLACE FUNCTION "guard_course_spec_competency_evidence_editable"()
RETURNS TRIGGER AS $$
DECLARE
  target_course_spec_id TEXT;
  review_status TEXT;
BEGIN
  target_course_spec_id :=
    CASE WHEN TG_OP = 'DELETE' THEN OLD."courseSpecId" ELSE NEW."courseSpecId" END;

  SELECT "reviewStatus"::TEXT
    INTO review_status
    FROM "CourseSpec"
    WHERE "id" = target_course_spec_id;

  IF review_status IS NULL THEN
    -- A parent CourseSpec delete may reach this child trigger after the parent
    -- row is no longer visible. The FK cascade is the only legitimate way a
    -- child DELETE can observe a missing parent; INSERT/UPDATE still fail closed.
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Course Specification does not exist';
  END IF;

  IF review_status NOT IN ('Draft', 'ChangesRequested') THEN
    RAISE EXCEPTION 'CourseSpec competency evidence can only change while the Course Specification is editable';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CourseSpecCompetencyEvidence_editable"
BEFORE INSERT OR UPDATE OR DELETE
ON "CourseSpecCompetencyEvidence"
FOR EACH ROW EXECUTE FUNCTION "guard_course_spec_competency_evidence_editable"();

CREATE TRIGGER "CourseSpecCompetencyEvidenceClo_editable"
BEFORE INSERT OR UPDATE OR DELETE
ON "CourseSpecCompetencyEvidenceClo"
FOR EACH ROW EXECUTE FUNCTION "guard_course_spec_competency_evidence_editable"();

ALTER TABLE "CourseSpecCompetencyEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSpecCompetencyEvidenceClo" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "CourseSpecCompetencyEvidence" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "CourseSpecCompetencyEvidenceClo" FROM PUBLIC;

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
      'public', 'CourseSpecCompetencyEvidence', api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
      'public', 'CourseSpecCompetencyEvidenceClo', api_role
    );
  END LOOP;
END
$$;
