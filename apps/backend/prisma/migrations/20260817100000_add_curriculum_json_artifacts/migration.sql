-- Issue #371: JSON curriculum import + pathway-safe historical DOCX artifact data.
--
-- Canonical common/default-route placement remains public."ProgrammeCurriculumCourse".
-- This protected schema stores mutually-exclusive pathway definitions and the
-- additional immutable source snapshots (hours/credit breakdown/lecturer text)
-- needed to reproduce an approved curriculum document without consulting
-- mutable Offering or Course presentation fields.

CREATE SCHEMA IF NOT EXISTS curriculum_artifact;

REVOKE ALL ON SCHEMA curriculum_artifact FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA curriculum_artifact FROM %I', api_role);
  END LOOP;
END $$;

CREATE TABLE curriculum_artifact."Pathway" (
  "curriculumVersionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "yearLevel" INTEGER NOT NULL,
  "semester" "Semester" NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "creditTarget" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Pathway_pkey" PRIMARY KEY ("curriculumVersionId", "code"),
  CONSTRAINT "Pathway_version_fkey" FOREIGN KEY ("curriculumVersionId")
    REFERENCES public."ProgrammeCurriculumVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Pathway_year_check" CHECK ("yearLevel" BETWEEN 1 AND 4),
  CONSTRAINT "Pathway_credit_target_check" CHECK ("creditTarget" IS NULL OR "creditTarget" >= 0),
  CONSTRAINT "Pathway_sort_order_check" CHECK ("sortOrder" >= 0)
);

CREATE UNIQUE INDEX "Pathway_one_default_per_version_key"
ON curriculum_artifact."Pathway" ("curriculumVersionId")
WHERE "isDefault" = TRUE;

CREATE TABLE curriculum_artifact."CourseSnapshot" (
  "id" TEXT NOT NULL,
  "curriculumVersionId" TEXT NOT NULL,
  "scopeCode" TEXT NOT NULL DEFAULT '__COMMON__',
  "placementId" TEXT,
  "courseId" TEXT,
  "courseCodeSnapshot" TEXT NOT NULL,
  "courseTitleSnapshot" TEXT NOT NULL,
  "yearLevel" INTEGER NOT NULL,
  "semester" "Semester" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "weeklyHoursTotal" INTEGER,
  "weeklyLectureHours" INTEGER,
  "weeklyLabHours" INTEGER,
  "weeklyFieldVisitHours" INTEGER,
  "creditsTotal" INTEGER NOT NULL,
  "creditLecture" INTEGER NOT NULL DEFAULT 0,
  "creditLab" INTEGER NOT NULL DEFAULT 0,
  "creditFieldVisit" INTEGER NOT NULL DEFAULT 0,
  "lecturerText" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseSnapshot_version_fkey" FOREIGN KEY ("curriculumVersionId")
    REFERENCES public."ProgrammeCurriculumVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseSnapshot_placement_fkey" FOREIGN KEY ("placementId")
    REFERENCES public."ProgrammeCurriculumCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CourseSnapshot_course_fkey" FOREIGN KEY ("courseId")
    REFERENCES public."Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseSnapshot_year_check" CHECK ("yearLevel" BETWEEN 1 AND 4),
  CONSTRAINT "CourseSnapshot_sort_order_check" CHECK ("sortOrder" >= 0),
  CONSTRAINT "CourseSnapshot_weekly_nonnegative_check" CHECK (
    ("weeklyHoursTotal" IS NULL OR "weeklyHoursTotal" >= 0) AND
    ("weeklyLectureHours" IS NULL OR "weeklyLectureHours" >= 0) AND
    ("weeklyLabHours" IS NULL OR "weeklyLabHours" >= 0) AND
    ("weeklyFieldVisitHours" IS NULL OR "weeklyFieldVisitHours" >= 0)
  ),
  CONSTRAINT "CourseSnapshot_credit_nonnegative_check" CHECK (
    "creditsTotal" >= 0 AND "creditLecture" >= 0 AND "creditLab" >= 0 AND "creditFieldVisit" >= 0
  )
);

CREATE UNIQUE INDEX "CourseSnapshot_version_scope_code_key"
ON curriculum_artifact."CourseSnapshot" ("curriculumVersionId", "scopeCode", "courseCodeSnapshot");
CREATE UNIQUE INDEX "CourseSnapshot_placement_key"
ON curriculum_artifact."CourseSnapshot" ("placementId") WHERE "placementId" IS NOT NULL;
CREATE INDEX "CourseSnapshot_version_location_idx"
ON curriculum_artifact."CourseSnapshot" ("curriculumVersionId", "yearLevel", "semester", "scopeCode", "sortOrder");

CREATE TABLE curriculum_artifact."ImportSource" (
  "curriculumVersionId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "formatVersion" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedById" TEXT NOT NULL,
  CONSTRAINT "ImportSource_pkey" PRIMARY KEY ("curriculumVersionId"),
  CONSTRAINT "ImportSource_version_fkey" FOREIGN KEY ("curriculumVersionId")
    REFERENCES public."ProgrammeCurriculumVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ImportSource_actor_fkey" FOREIGN KEY ("importedById")
    REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ImportSource_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

-- Artifact rows may only be edited while their curriculum version is Draft.
-- A migration-only session flag permits the one-time legacy snapshot backfill;
-- it is cleared immediately after that statement.
CREATE OR REPLACE FUNCTION curriculum_artifact."assert_draft_version"()
RETURNS TRIGGER AS $$
DECLARE
  version_id TEXT;
  version_status "ProgrammeCurriculumStatus";
BEGIN
  IF TG_OP = 'DELETE' THEN
    version_id := OLD."curriculumVersionId";
  ELSE
    version_id := NEW."curriculumVersionId";
  END IF;

  SELECT "status" INTO version_status
  FROM public."ProgrammeCurriculumVersion"
  WHERE "id" = version_id;

  IF version_status IS NULL THEN
    RAISE EXCEPTION 'Curriculum version not found for artifact row';
  END IF;
  IF version_status <> 'Draft'
     AND current_setting('dse.curriculum_artifact_backfill', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Curriculum artifact is immutable while version status is %', version_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Pathway_draft_only"
BEFORE INSERT OR UPDATE OR DELETE ON curriculum_artifact."Pathway"
FOR EACH ROW EXECUTE FUNCTION curriculum_artifact."assert_draft_version"();

CREATE TRIGGER "CourseSnapshot_draft_only"
BEFORE INSERT OR UPDATE OR DELETE ON curriculum_artifact."CourseSnapshot"
FOR EACH ROW EXECUTE FUNCTION curriculum_artifact."assert_draft_version"();

CREATE TRIGGER "ImportSource_draft_only"
BEFORE INSERT OR UPDATE OR DELETE ON curriculum_artifact."ImportSource"
FOR EACH ROW EXECUTE FUNCTION curriculum_artifact."assert_draft_version"();

-- Validate that any non-common scope points at a pathway in the exact version.
CREATE OR REPLACE FUNCTION curriculum_artifact."validate_course_scope"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."scopeCode" <> '__COMMON__' AND NOT EXISTS (
    SELECT 1 FROM curriculum_artifact."Pathway" p
    WHERE p."curriculumVersionId" = NEW."curriculumVersionId"
      AND p."code" = NEW."scopeCode"
  ) THEN
    RAISE EXCEPTION 'Curriculum course snapshot references an unknown pathway %', NEW."scopeCode";
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

CREATE TRIGGER "CourseSnapshot_validate_scope"
BEFORE INSERT OR UPDATE ON curriculum_artifact."CourseSnapshot"
FOR EACH ROW EXECUTE FUNCTION curriculum_artifact."validate_course_scope"();

-- Best-available artifact snapshot for curriculum placements that predate #371.
-- We intentionally do not invent lecture/lab/field credit composition or
-- lecturer/hour source data for historical rows that never stored it.
SELECT set_config('dse.curriculum_artifact_backfill', 'on', false);
INSERT INTO curriculum_artifact."CourseSnapshot" (
  "id", "curriculumVersionId", "scopeCode", "placementId", "courseId",
  "courseCodeSnapshot", "courseTitleSnapshot", "yearLevel", "semester", "sortOrder",
  "creditsTotal", "creditLecture", "creditLab", "creditFieldVisit", "lecturerText"
)
SELECT
  pc."id", pc."curriculumVersionId", '__COMMON__', pc."id", pc."courseId",
  c."code", c."title", pc."yearLevel", pc."semester", pc."sortOrder",
  pc."creditsSnapshot", 0, 0, 0, ''
FROM public."ProgrammeCurriculumCourse" pc
JOIN public."Course" c ON c."id" = pc."courseId";
SELECT set_config('dse.curriculum_artifact_backfill', 'off', false);

-- New manually-added Draft placements receive a stable fallback snapshot. JSON
-- import later replaces the fallback values with exact source metadata.
CREATE OR REPLACE FUNCTION curriculum_artifact."snapshot_new_placement"()
RETURNS TRIGGER AS $$
DECLARE
  predecessor_id TEXT;
  predecessor_snapshot curriculum_artifact."CourseSnapshot"%ROWTYPE;
  course_code TEXT;
  course_title TEXT;
BEGIN
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
      NEW."id", NEW."curriculumVersionId", predecessor_snapshot."scopeCode", NEW."id", NEW."courseId",
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
      NEW."id", NEW."curriculumVersionId", '__COMMON__', NEW."id", NEW."courseId",
      course_code, course_title, NEW."yearLevel", NEW."semester", NEW."sortOrder",
      NEW."creditsSnapshot", 0, 0, 0, ''
    ) ON CONFLICT ("placementId") WHERE "placementId" IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumCourse_snapshot_artifact"
AFTER INSERT ON public."ProgrammeCurriculumCourse"
FOR EACH ROW EXECUTE FUNCTION curriculum_artifact."snapshot_new_placement"();

-- Revision creation first inserts ProgrammeCurriculumVersion and then public
-- placement copies. Clone pathway definitions and non-default alternative rows
-- immediately; placement-linked snapshots are copied by the trigger above.
CREATE OR REPLACE FUNCTION curriculum_artifact."clone_revision_artifact"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."basedOnVersionId" IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO curriculum_artifact."Pathway" (
    "curriculumVersionId", "code", "name", "yearLevel", "semester", "isDefault", "creditTarget", "sortOrder"
  )
  SELECT NEW."id", "code", "name", "yearLevel", "semester", "isDefault", "creditTarget", "sortOrder"
  FROM curriculum_artifact."Pathway"
  WHERE "curriculumVersionId" = NEW."basedOnVersionId";

  INSERT INTO curriculum_artifact."CourseSnapshot" (
    "id", "curriculumVersionId", "scopeCode", "placementId", "courseId",
    "courseCodeSnapshot", "courseTitleSnapshot", "yearLevel", "semester", "sortOrder",
    "weeklyHoursTotal", "weeklyLectureHours", "weeklyLabHours", "weeklyFieldVisitHours",
    "creditsTotal", "creditLecture", "creditLab", "creditFieldVisit", "lecturerText"
  )
  SELECT
    NEW."id" || ':' || "scopeCode" || ':' || "courseCodeSnapshot",
    NEW."id", "scopeCode", NULL, "courseId",
    "courseCodeSnapshot", "courseTitleSnapshot", "yearLevel", "semester", "sortOrder",
    "weeklyHoursTotal", "weeklyLectureHours", "weeklyLabHours", "weeklyFieldVisitHours",
    "creditsTotal", "creditLecture", "creditLab", "creditFieldVisit", "lecturerText"
  FROM curriculum_artifact."CourseSnapshot"
  WHERE "curriculumVersionId" = NEW."basedOnVersionId"
    AND "placementId" IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeCurriculumVersion_clone_artifact"
AFTER INSERT ON public."ProgrammeCurriculumVersion"
FOR EACH ROW EXECUTE FUNCTION curriculum_artifact."clone_revision_artifact"();

ALTER TABLE curriculum_artifact."Pathway" ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_artifact."CourseSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_artifact."ImportSource" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA curriculum_artifact FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA curriculum_artifact FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA curriculum_artifact FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA curriculum_artifact FROM %I', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA curriculum_artifact FROM %I', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA curriculum_artifact FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA curriculum_artifact REVOKE ALL ON TABLES FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA curriculum_artifact REVOKE ALL ON SEQUENCES FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA curriculum_artifact REVOKE ALL ON FUNCTIONS FROM %I', api_role);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA curriculum_artifact REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA curriculum_artifact REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA curriculum_artifact REVOKE ALL ON FUNCTIONS FROM PUBLIC;
