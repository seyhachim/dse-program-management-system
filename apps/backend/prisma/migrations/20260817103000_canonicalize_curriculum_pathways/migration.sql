-- Issue #371 follow-up: make mutually-exclusive curriculum pathways canonical.
--
-- The first #371 migration kept alternative routes only in curriculum_artifact.
-- This additive migration promotes pathway identity/membership into the canonical
-- ProgrammeCurriculum domain while preserving the protected artifact schema only
-- for export/provenance snapshots. Existing approved academic rows are not
-- rewritten semantically: source values are copied exactly and historical
-- immutability is restored before the migration completes.

CREATE TABLE public."ProgrammeCurriculumPathway" (
  "id" TEXT NOT NULL,
  "curriculumVersionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "yearLevel" INTEGER NOT NULL,
  "semester" "Semester" NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "creditTarget" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeCurriculumPathway_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeCurriculumPathway_version_fkey"
    FOREIGN KEY ("curriculumVersionId") REFERENCES public."ProgrammeCurriculumVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeCurriculumPathway_year_check" CHECK ("yearLevel" BETWEEN 1 AND 4),
  CONSTRAINT "ProgrammeCurriculumPathway_credit_target_check"
    CHECK ("creditTarget" IS NULL OR "creditTarget" >= 0),
  CONSTRAINT "ProgrammeCurriculumPathway_sort_order_check" CHECK ("sortOrder" >= 0)
);

CREATE UNIQUE INDEX "ProgrammeCurriculumPathway_version_code_key"
  ON public."ProgrammeCurriculumPathway"("curriculumVersionId", "code");
CREATE UNIQUE INDEX "ProgrammeCurriculumPathway_one_default_per_version_key"
  ON public."ProgrammeCurriculumPathway"("curriculumVersionId")
  WHERE "isDefault" = TRUE;
CREATE INDEX "ProgrammeCurriculumPathway_version_location_idx"
  ON public."ProgrammeCurriculumPathway"("curriculumVersionId", "yearLevel", "semester", "sortOrder");

ALTER TABLE public."ProgrammeCurriculumCourse"
  ADD COLUMN "pathwayId" TEXT;

-- Preserve pathway definitions already imported by the earlier draft implementation.
INSERT INTO public."ProgrammeCurriculumPathway" (
  "id", "curriculumVersionId", "code", "name", "yearLevel", "semester",
  "isDefault", "creditTarget", "sortOrder"
)
SELECT
  p."curriculumVersionId" || ':' || p."code",
  p."curriculumVersionId", p."code", p."name", p."yearLevel", p."semester",
  p."isDefault", p."creditTarget", p."sortOrder"
FROM curriculum_artifact."Pathway" p;

-- Existing common/default-route placements already have artifact snapshots.
-- Use their exact stored scope to attach pathway membership without inference.
UPDATE public."ProgrammeCurriculumCourse" pc
SET "pathwayId" = p."id"
FROM curriculum_artifact."CourseSnapshot" s
JOIN public."ProgrammeCurriculumPathway" p
  ON p."curriculumVersionId" = s."curriculumVersionId"
 AND p."code" = s."scopeCode"
WHERE s."placementId" = pc."id"
  AND s."scopeCode" <> '__COMMON__';

-- Before promoting previously artifact-only alternatives, require a canonical
-- Course and explicit course type. Failing closed avoids inventing academic type.
DO $$
DECLARE missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count
  FROM curriculum_artifact."CourseSnapshot" s
  LEFT JOIN public."Course" c ON c."id" = s."courseId"
  WHERE s."placementId" IS NULL
    AND (c."id" IS NULL OR c."courseType" IS NULL);

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Cannot canonicalize % alternative curriculum rows without a typed canonical Course', missing_count;
  END IF;
END
$$;

-- Historical versions may be immutable. Temporarily disable only the two
-- placement triggers while copying already-recorded artifact rows into the new
-- canonical representation; all triggers are restored immediately afterwards.
ALTER TABLE public."ProgrammeCurriculumCourse"
  DISABLE TRIGGER "ProgrammeCurriculumCourse_protect_immutable_parent";
ALTER TABLE public."ProgrammeCurriculumCourse"
  DISABLE TRIGGER "ProgrammeCurriculumCourse_snapshot_artifact";

INSERT INTO public."ProgrammeCurriculumCourse" (
  "id", "curriculumVersionId", "courseId", "pathwayId", "yearLevel", "semester",
  "creditsSnapshot", "courseTypeSnapshot", "sortOrder", "createdAt", "updatedAt"
)
SELECT
  s."id" || ':placement',
  s."curriculumVersionId",
  s."courseId",
  p."id",
  s."yearLevel",
  s."semester",
  s."creditsTotal",
  c."courseType",
  s."sortOrder",
  s."createdAt",
  s."updatedAt"
FROM curriculum_artifact."CourseSnapshot" s
JOIN public."Course" c ON c."id" = s."courseId"
JOIN public."ProgrammeCurriculumPathway" p
  ON p."curriculumVersionId" = s."curriculumVersionId"
 AND p."code" = s."scopeCode"
WHERE s."placementId" IS NULL;

UPDATE curriculum_artifact."CourseSnapshot" s
SET "placementId" = pc."id", "updatedAt" = CURRENT_TIMESTAMP
FROM public."ProgrammeCurriculumCourse" pc
JOIN public."ProgrammeCurriculumPathway" p ON p."id" = pc."pathwayId"
WHERE s."placementId" IS NULL
  AND s."curriculumVersionId" = pc."curriculumVersionId"
  AND s."courseId" = pc."courseId"
  AND s."scopeCode" = p."code";

ALTER TABLE public."ProgrammeCurriculumCourse"
  ENABLE TRIGGER "ProgrammeCurriculumCourse_snapshot_artifact";
ALTER TABLE public."ProgrammeCurriculumCourse"
  ENABLE TRIGGER "ProgrammeCurriculumCourse_protect_immutable_parent";

ALTER TABLE public."ProgrammeCurriculumCourse"
  ADD CONSTRAINT "ProgrammeCurriculumCourse_pathwayId_fkey"
  FOREIGN KEY ("pathwayId") REFERENCES public."ProgrammeCurriculumPathway"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ProgrammeCurriculumCourse_pathwayId_idx"
  ON public."ProgrammeCurriculumCourse"("pathwayId");

-- A pathway is itself part of the immutable curriculum snapshot.
CREATE OR REPLACE FUNCTION public."protect_immutable_programme_curriculum_pathway"()
RETURNS TRIGGER AS $$
DECLARE
  version_id TEXT;
  version_status "ProgrammeCurriculumStatus";
BEGIN
  version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."curriculumVersionId" ELSE NEW."curriculumVersionId" END;
  SELECT "status" INTO version_status
  FROM public."ProgrammeCurriculumVersion"
  WHERE "id" = version_id;

  IF version_status IS NULL THEN
    RAISE EXCEPTION 'Curriculum version not found for pathway';
  END IF;
  IF version_status <> 'Draft' THEN
    RAISE EXCEPTION 'Cannot mutate pathways of an immutable curriculum version';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumPathway_protect_immutable_parent"
BEFORE INSERT OR UPDATE OR DELETE ON public."ProgrammeCurriculumPathway"
FOR EACH ROW EXECUTE FUNCTION public."protect_immutable_programme_curriculum_pathway"();

-- Membership must point to a pathway in the exact same version and location.
CREATE OR REPLACE FUNCTION public."validate_programme_curriculum_course_pathway"()
RETURNS TRIGGER AS $$
DECLARE
  pathway_version TEXT;
  pathway_year INTEGER;
  pathway_semester "Semester";
BEGIN
  IF NEW."pathwayId" IS NULL THEN RETURN NEW; END IF;

  SELECT "curriculumVersionId", "yearLevel", "semester"
    INTO pathway_version, pathway_year, pathway_semester
  FROM public."ProgrammeCurriculumPathway"
  WHERE "id" = NEW."pathwayId";

  IF pathway_version IS NULL OR pathway_version <> NEW."curriculumVersionId" THEN
    RAISE EXCEPTION 'Curriculum placement pathway must belong to the same version';
  END IF;
  IF pathway_year <> NEW."yearLevel" OR pathway_semester <> NEW."semester" THEN
    RAISE EXCEPTION 'Curriculum placement location must match its pathway';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumCourse_validate_pathway"
BEFORE INSERT OR UPDATE OF "pathwayId", "curriculumVersionId", "yearLevel", "semester"
ON public."ProgrammeCurriculumCourse"
FOR EACH ROW EXECUTE FUNCTION public."validate_programme_curriculum_course_pathway"();

-- Revision creation already clones every canonical placement. Clone pathway rows
-- when the new version is inserted, then let a BEFORE INSERT trigger map each
-- cloned placement to the same pathway code in the new version.
CREATE OR REPLACE FUNCTION public."clone_programme_curriculum_pathways"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."basedOnVersionId" IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public."ProgrammeCurriculumPathway" (
    "id", "curriculumVersionId", "code", "name", "yearLevel", "semester",
    "isDefault", "creditTarget", "sortOrder"
  )
  SELECT
    NEW."id" || ':' || "code", NEW."id", "code", "name", "yearLevel", "semester",
    "isDefault", "creditTarget", "sortOrder"
  FROM public."ProgrammeCurriculumPathway"
  WHERE "curriculumVersionId" = NEW."basedOnVersionId";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumVersion_clone_canonical_pathways"
AFTER INSERT ON public."ProgrammeCurriculumVersion"
FOR EACH ROW EXECUTE FUNCTION public."clone_programme_curriculum_pathways"();

CREATE OR REPLACE FUNCTION public."inherit_programme_curriculum_course_pathway"()
RETURNS TRIGGER AS $$
DECLARE
  predecessor_id TEXT;
  predecessor_code TEXT;
  inherited_id TEXT;
BEGIN
  IF NEW."pathwayId" IS NOT NULL THEN RETURN NEW; END IF;

  SELECT "basedOnVersionId" INTO predecessor_id
  FROM public."ProgrammeCurriculumVersion"
  WHERE "id" = NEW."curriculumVersionId";
  IF predecessor_id IS NULL THEN RETURN NEW; END IF;

  SELECT p."code" INTO predecessor_code
  FROM public."ProgrammeCurriculumCourse" pc
  JOIN public."ProgrammeCurriculumPathway" p ON p."id" = pc."pathwayId"
  WHERE pc."curriculumVersionId" = predecessor_id
    AND pc."courseId" = NEW."courseId";

  IF predecessor_code IS NULL THEN RETURN NEW; END IF;

  SELECT "id" INTO inherited_id
  FROM public."ProgrammeCurriculumPathway"
  WHERE "curriculumVersionId" = NEW."curriculumVersionId"
    AND "code" = predecessor_code;
  NEW."pathwayId" := inherited_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumCourse_inherit_pathway"
BEFORE INSERT ON public."ProgrammeCurriculumCourse"
FOR EACH ROW EXECUTE FUNCTION public."inherit_programme_curriculum_course_pathway"();

-- The protected artifact now contains only export/provenance snapshots. Scope
-- validation resolves against canonical pathways rather than a second pathway store.
CREATE OR REPLACE FUNCTION curriculum_artifact."validate_course_scope"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."scopeCode" <> '__COMMON__' AND NOT EXISTS (
    SELECT 1 FROM public."ProgrammeCurriculumPathway" p
    WHERE p."curriculumVersionId" = NEW."curriculumVersionId"
      AND p."code" = NEW."scopeCode"
  ) THEN
    RAISE EXCEPTION 'Curriculum course snapshot references an unknown canonical pathway %', NEW."scopeCode";
  END IF;

  IF NEW."placementId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."ProgrammeCurriculumCourse" pc
    WHERE pc."id" = NEW."placementId"
      AND pc."curriculumVersionId" = NEW."curriculumVersionId"
      AND (NEW."courseId" IS NULL OR pc."courseId" = NEW."courseId")
  ) THEN
    RAISE EXCEPTION 'Curriculum artifact placement does not belong to this version/course';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION curriculum_artifact."snapshot_new_placement"()
RETURNS TRIGGER AS $$
DECLARE
  predecessor_id TEXT;
  predecessor_snapshot curriculum_artifact."CourseSnapshot"%ROWTYPE;
  course_code TEXT;
  course_title TEXT;
  placement_scope TEXT := '__COMMON__';
BEGIN
  IF NEW."pathwayId" IS NOT NULL THEN
    SELECT "code" INTO placement_scope
    FROM public."ProgrammeCurriculumPathway"
    WHERE "id" = NEW."pathwayId";
  END IF;

  SELECT "basedOnVersionId" INTO predecessor_id
  FROM public."ProgrammeCurriculumVersion"
  WHERE "id" = NEW."curriculumVersionId";

  IF predecessor_id IS NOT NULL THEN
    SELECT s.* INTO predecessor_snapshot
    FROM curriculum_artifact."CourseSnapshot" s
    WHERE s."curriculumVersionId" = predecessor_id
      AND s."courseId" = NEW."courseId"
      AND s."placementId" IS NOT NULL
    ORDER BY s."createdAt" ASC
    LIMIT 1;
  END IF;

  IF predecessor_snapshot."id" IS NOT NULL THEN
    INSERT INTO curriculum_artifact."CourseSnapshot" (
      "id", "curriculumVersionId", "scopeCode", "placementId", "courseId",
      "courseCodeSnapshot", "courseTitleSnapshot", "yearLevel", "semester", "sortOrder",
      "weeklyHoursTotal", "weeklyLectureHours", "weeklyLabHours", "weeklyFieldVisitHours",
      "creditsTotal", "creditLecture", "creditLab", "creditFieldVisit", "lecturerText"
    ) VALUES (
      NEW."id", NEW."curriculumVersionId", placement_scope, NEW."id", NEW."courseId",
      predecessor_snapshot."courseCodeSnapshot", predecessor_snapshot."courseTitleSnapshot",
      NEW."yearLevel", NEW."semester", NEW."sortOrder",
      predecessor_snapshot."weeklyHoursTotal", predecessor_snapshot."weeklyLectureHours",
      predecessor_snapshot."weeklyLabHours", predecessor_snapshot."weeklyFieldVisitHours",
      NEW."creditsSnapshot", predecessor_snapshot."creditLecture", predecessor_snapshot."creditLab",
      predecessor_snapshot."creditFieldVisit", predecessor_snapshot."lecturerText"
    ) ON CONFLICT ("placementId") WHERE "placementId" IS NOT NULL DO NOTHING;
  ELSE
    SELECT "code", "title" INTO course_code, course_title
    FROM public."Course" WHERE "id" = NEW."courseId";
    INSERT INTO curriculum_artifact."CourseSnapshot" (
      "id", "curriculumVersionId", "scopeCode", "placementId", "courseId",
      "courseCodeSnapshot", "courseTitleSnapshot", "yearLevel", "semester", "sortOrder",
      "creditsTotal", "creditLecture", "creditLab", "creditFieldVisit", "lecturerText"
    ) VALUES (
      NEW."id", NEW."curriculumVersionId", placement_scope, NEW."id", NEW."courseId",
      course_code, course_title, NEW."yearLevel", NEW."semester", NEW."sortOrder",
      NEW."creditsSnapshot", 0, 0, 0, ''
    ) ON CONFLICT ("placementId") WHERE "placementId" IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The old revision artifact trigger only existed to clone artifact-only pathways
-- and alternatives. Both are canonical now, so leave the trigger harmless.
CREATE OR REPLACE FUNCTION curriculum_artifact."clone_revision_artifact"()
RETURNS TRIGGER AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TABLE curriculum_artifact."Pathway";

-- Official source-declared totals are immutable version snapshots. They coexist
-- with row-derived totals so inconsistencies (such as DSE 2026's printed 143 vs
-- arithmetic 144) stay auditable instead of being silently corrected.
CREATE TABLE curriculum_artifact."DeclaredTotals" (
  "curriculumVersionId" TEXT NOT NULL,
  "semesterCredits" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "pathwayCredits" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "programmeCourseCount" INTEGER,
  "programmeCredits" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeclaredTotals_pkey" PRIMARY KEY ("curriculumVersionId"),
  CONSTRAINT "DeclaredTotals_version_fkey" FOREIGN KEY ("curriculumVersionId")
    REFERENCES public."ProgrammeCurriculumVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeclaredTotals_course_count_check"
    CHECK ("programmeCourseCount" IS NULL OR "programmeCourseCount" >= 0),
  CONSTRAINT "DeclaredTotals_credit_check"
    CHECK ("programmeCredits" IS NULL OR "programmeCredits" >= 0)
);

CREATE TRIGGER "DeclaredTotals_draft_only"
BEFORE INSERT OR UPDATE OR DELETE ON curriculum_artifact."DeclaredTotals"
FOR EACH ROW EXECUTE FUNCTION curriculum_artifact."assert_draft_version"();

ALTER TABLE curriculum_artifact."ImportSource"
  ADD COLUMN "decisions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "warnings" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public."ProgrammeCurriculumPathway" ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_artifact."DeclaredTotals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."ProgrammeCurriculumPathway" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE curriculum_artifact."DeclaredTotals" FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public."ProgrammeCurriculumPathway" FROM %I', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE curriculum_artifact."DeclaredTotals" FROM %I', api_role);
  END LOOP;
END
$$;
