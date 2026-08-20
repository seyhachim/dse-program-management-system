-- Issue #457: versioned programme grading scales and exact CourseSpec binding.
-- The baseline rows exactly reproduce the former shared LETTER_GRADES constant.
-- No historical effective date is fabricated for that imported baseline.

CREATE TYPE "ProgrammeGradingScaleVersionStatus" AS ENUM (
  'Draft',
  'Approved',
  'Superseded'
);

CREATE TYPE "ProgrammeGradingScaleAuditActionType" AS ENUM (
  'Created',
  'GradeRowsUpdated',
  'Approved',
  'Superseded'
);

CREATE TABLE "ProgrammeGradingScale" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeGradingScale_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeGradingScale_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "Programme"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProgrammeGradingScaleVersion" (
  "id" TEXT NOT NULL,
  "gradingScaleId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "ProgrammeGradingScaleVersionStatus" NOT NULL DEFAULT 'Draft',
  "effectiveFrom" DATE,
  "effectiveTo" DATE,
  "changeSummary" TEXT NOT NULL DEFAULT '',
  "basedOnVersionId" TEXT,
  "legacyImported" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeGradingScaleVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeGradingScaleVersion_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "ProgrammeGradingScaleVersion_effective_range"
    CHECK (
      "effectiveTo" IS NULL
      OR "effectiveFrom" IS NULL
      OR "effectiveTo" > "effectiveFrom"
    ),
  CONSTRAINT "ProgrammeGradingScaleVersion_not_own_predecessor"
    CHECK ("basedOnVersionId" IS NULL OR "basedOnVersionId" <> "id"),
  CONSTRAINT "ProgrammeGradingScaleVersion_gradingScaleId_fkey"
    FOREIGN KEY ("gradingScaleId") REFERENCES "ProgrammeGradingScale"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeGradingScaleVersion_basedOnVersionId_fkey"
    FOREIGN KEY ("basedOnVersionId") REFERENCES "ProgrammeGradingScaleVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeGradingScaleVersion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeGradingScaleVersion_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProgrammeGradingScaleGrade" (
  "id" TEXT NOT NULL,
  "gradingScaleVersionId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "letterGrade" TEXT NOT NULL,
  "gradePoint" DECIMAL(4,2) NOT NULL,
  "minScore" DECIMAL(5,2) NOT NULL,
  "maxScore" DECIMAL(5,2) NOT NULL,
  "minInclusive" BOOLEAN NOT NULL DEFAULT true,
  "maxInclusive" BOOLEAN NOT NULL DEFAULT false,
  "explanation" TEXT NOT NULL DEFAULT '',
  "isPassing" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeGradingScaleGrade_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeGradingScaleGrade_sort_order_positive" CHECK ("sortOrder" >= 1),
  CONSTRAINT "ProgrammeGradingScaleGrade_grade_point_nonnegative" CHECK ("gradePoint" >= 0),
  CONSTRAINT "ProgrammeGradingScaleGrade_score_range"
    CHECK (
      "minScore" >= 0
      AND "maxScore" <= 100
      AND "minScore" < "maxScore"
    ),
  CONSTRAINT "ProgrammeGradingScaleGrade_gradingScaleVersionId_fkey"
    FOREIGN KEY ("gradingScaleVersionId") REFERENCES "ProgrammeGradingScaleVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProgrammeGradingScaleAuditAction" (
  "id" TEXT NOT NULL,
  "gradingScaleVersionId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" "ProgrammeGradingScaleAuditActionType" NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeGradingScaleAuditAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeGradingScaleAuditAction_gradingScaleVersionId_fkey"
    FOREIGN KEY ("gradingScaleVersionId") REFERENCES "ProgrammeGradingScaleVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammeGradingScaleAuditAction_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "CourseSpec" ADD COLUMN "gradingScaleVersionId" TEXT;
ALTER TABLE "CourseSpec"
  ADD CONSTRAINT "CourseSpec_gradingScaleVersionId_fkey"
  FOREIGN KEY ("gradingScaleVersionId")
  REFERENCES "ProgrammeGradingScaleVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ProgrammeGradingScale_programmeId_code_key"
  ON "ProgrammeGradingScale"("programmeId", "code");
CREATE INDEX "ProgrammeGradingScale_programmeId_idx"
  ON "ProgrammeGradingScale"("programmeId");
CREATE UNIQUE INDEX "ProgrammeGradingScale_one_default_per_programme"
  ON "ProgrammeGradingScale"("programmeId")
  WHERE "isDefault" = true;

CREATE UNIQUE INDEX "ProgrammeGradingScaleVersion_gradingScaleId_version_key"
  ON "ProgrammeGradingScaleVersion"("gradingScaleId", "version");
CREATE INDEX "ProgrammeGradingScaleVersion_gradingScaleId_status_idx"
  ON "ProgrammeGradingScaleVersion"("gradingScaleId", "status");
CREATE INDEX "ProgrammeGradingScaleVersion_effectiveFrom_effectiveTo_idx"
  ON "ProgrammeGradingScaleVersion"("effectiveFrom", "effectiveTo");
CREATE INDEX "ProgrammeGradingScaleVersion_basedOnVersionId_idx"
  ON "ProgrammeGradingScaleVersion"("basedOnVersionId");
CREATE INDEX "ProgrammeGradingScaleVersion_createdById_idx"
  ON "ProgrammeGradingScaleVersion"("createdById");
CREATE INDEX "ProgrammeGradingScaleVersion_approvedById_idx"
  ON "ProgrammeGradingScaleVersion"("approvedById");
CREATE UNIQUE INDEX "ProgrammeGradingScaleVersion_one_approved_per_scale"
  ON "ProgrammeGradingScaleVersion"("gradingScaleId")
  WHERE "status" = 'Approved';

CREATE UNIQUE INDEX "ProgrammeGradingScaleGrade_version_letter_key"
  ON "ProgrammeGradingScaleGrade"("gradingScaleVersionId", "letterGrade");
CREATE UNIQUE INDEX "ProgrammeGradingScaleGrade_version_sort_order_key"
  ON "ProgrammeGradingScaleGrade"("gradingScaleVersionId", "sortOrder");
CREATE INDEX "ProgrammeGradingScaleGrade_version_idx"
  ON "ProgrammeGradingScaleGrade"("gradingScaleVersionId");

CREATE INDEX "ProgrammeGradingScaleAuditAction_version_createdAt_idx"
  ON "ProgrammeGradingScaleAuditAction"("gradingScaleVersionId", "createdAt");
CREATE INDEX "ProgrammeGradingScaleAuditAction_actorId_idx"
  ON "ProgrammeGradingScaleAuditAction"("actorId");
CREATE INDEX "CourseSpec_gradingScaleVersionId_idx"
  ON "CourseSpec"("gradingScaleVersionId");

-- Deterministic legacy baseline. This helper also runs when the fresh-db seed
-- later inserts the DSE Programme, so migration-before-seed and upgrade-in-place
-- produce the same policy rows without modifying the seed order.
CREATE OR REPLACE FUNCTION "ensure_dse_baseline_grading_scale"(
  programme_id TEXT,
  programme_code TEXT
)
RETURNS VOID AS $$
DECLARE
  scale_id TEXT := '04570000-0000-4000-8000-000000000001';
  version_id TEXT := '04570000-0000-4000-8000-000000000002';
BEGIN
  IF lower(programme_id) <> 'dse' AND lower(programme_code) <> 'dse' THEN
    RETURN;
  END IF;

  INSERT INTO "ProgrammeGradingScale" (
    "id", "programmeId", "code", "name", "description", "isDefault", "createdAt", "updatedAt"
  ) VALUES (
    scale_id,
    programme_id,
    'standard',
    'DSE Standard Grading Scale',
    'Programme-wide §24 letter-grade and grade-point policy.',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("programmeId", "code") DO NOTHING;

  SELECT "id" INTO scale_id
  FROM "ProgrammeGradingScale"
  WHERE "programmeId" = programme_id AND "code" = 'standard';

  INSERT INTO "ProgrammeGradingScaleVersion" (
    "id", "gradingScaleId", "version", "status", "effectiveFrom", "effectiveTo",
    "changeSummary", "legacyImported", "approvedAt", "createdAt", "updatedAt"
  ) VALUES (
    version_id,
    scale_id,
    1,
    'Approved',
    NULL,
    NULL,
    'Imported from the pre-#457 fixed DSE §24 rating scale.',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("gradingScaleId", "version") DO NOTHING;

  SELECT "id" INTO version_id
  FROM "ProgrammeGradingScaleVersion"
  WHERE "gradingScaleId" = scale_id AND "version" = 1;

  INSERT INTO "ProgrammeGradingScaleGrade" (
    "id", "gradingScaleVersionId", "sortOrder", "letterGrade", "gradePoint",
    "minScore", "maxScore", "minInclusive", "maxInclusive", "explanation",
    "isPassing", "createdAt", "updatedAt"
  ) VALUES
    ('04570000-0000-4000-8000-000000000011', version_id, 1, 'A',  4.00, 85, 100, true, true,  'Excellent',   true,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('04570000-0000-4000-8000-000000000012', version_id, 2, 'B+', 3.50, 80,  85, true, false, 'Very Good',   true,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('04570000-0000-4000-8000-000000000013', version_id, 3, 'B',  3.00, 75,  80, true, false, 'Good',        true,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('04570000-0000-4000-8000-000000000014', version_id, 4, 'C+', 2.50, 70,  75, true, false, 'Fairly Good', true,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('04570000-0000-4000-8000-000000000015', version_id, 5, 'C',  2.00, 65,  70, true, false, 'Fair',        true,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('04570000-0000-4000-8000-000000000016', version_id, 6, 'D+', 1.50, 60,  65, true, false, 'Poor',        true,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('04570000-0000-4000-8000-000000000017', version_id, 7, 'D',  1.00, 50,  60, true, false, 'Very Poor',   true,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('04570000-0000-4000-8000-000000000018', version_id, 8, 'F',  0.00,  0,  50, true, false, 'Fail',        false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("gradingScaleVersionId", "letterGrade") DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "seed_dse_grading_scale_after_programme_insert"()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM "ensure_dse_baseline_grading_scale"(NEW."id", NEW."code");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Programme_seed_dse_grading_scale"
AFTER INSERT ON "Programme"
FOR EACH ROW
EXECUTE FUNCTION "seed_dse_grading_scale_after_programme_insert"();

DO $$
DECLARE
  programme_row RECORD;
  baseline_version_id TEXT;
BEGIN
  SELECT "id", "code" INTO programme_row
  FROM "Programme"
  WHERE lower("id") = 'dse' OR lower("code") = 'dse'
  ORDER BY CASE WHEN lower("id") = 'dse' THEN 0 ELSE 1 END
  LIMIT 1;

  IF FOUND THEN
    PERFORM "ensure_dse_baseline_grading_scale"(
      programme_row."id",
      programme_row."code"
    );

    SELECT v."id" INTO baseline_version_id
    FROM "ProgrammeGradingScaleVersion" v
    JOIN "ProgrammeGradingScale" s ON s."id" = v."gradingScaleId"
    WHERE s."programmeId" = programme_row."id"
      AND s."isDefault" = true
      AND v."version" = 1
    LIMIT 1;

    UPDATE "CourseSpec" cs
    SET "gradingScaleVersionId" = baseline_version_id
    FROM "Course" c
    WHERE cs."courseId" = c."id"
      AND c."programmeId" = programme_row."id"
      AND cs."gradingScaleVersionId" IS NULL;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "check_programme_grading_scale_predecessor"()
RETURNS TRIGGER AS $$
DECLARE
  predecessor_scale_id TEXT;
BEGIN
  IF NEW."basedOnVersionId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "gradingScaleId" INTO predecessor_scale_id
  FROM "ProgrammeGradingScaleVersion"
  WHERE "id" = NEW."basedOnVersionId";

  IF predecessor_scale_id IS NULL OR predecessor_scale_id <> NEW."gradingScaleId" THEN
    RAISE EXCEPTION 'Grading-scale predecessor must belong to the same scale';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeGradingScaleVersion_predecessor_same_scale"
BEFORE INSERT OR UPDATE OF "basedOnVersionId", "gradingScaleId"
ON "ProgrammeGradingScaleVersion"
FOR EACH ROW
EXECUTE FUNCTION "check_programme_grading_scale_predecessor"();

CREATE OR REPLACE FUNCTION "protect_immutable_programme_grading_scale_version"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('Approved', 'Superseded') THEN
      RAISE EXCEPTION 'Approved and Superseded grading-scale versions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" IN ('Approved', 'Superseded') THEN
    IF NEW."gradingScaleId" IS DISTINCT FROM OLD."gradingScaleId"
      OR NEW."version" IS DISTINCT FROM OLD."version"
      OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
      OR NEW."changeSummary" IS DISTINCT FROM OLD."changeSummary"
      OR NEW."basedOnVersionId" IS DISTINCT FROM OLD."basedOnVersionId"
      OR NEW."legacyImported" IS DISTINCT FROM OLD."legacyImported"
      OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
      OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById"
      OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    THEN
      RAISE EXCEPTION 'Approved and Superseded grading-scale academic fields are immutable';
    END IF;

    IF OLD."status" = 'Approved' THEN
      IF NEW."status" NOT IN ('Approved', 'Superseded') THEN
        RAISE EXCEPTION 'Approved grading-scale versions can only remain Approved or become Superseded';
      END IF;
      IF NEW."status" = 'Approved'
        AND (
          NEW."effectiveTo" IS DISTINCT FROM OLD."effectiveTo"
          OR NEW."supersededAt" IS DISTINCT FROM OLD."supersededAt"
        )
      THEN
        RAISE EXCEPTION 'An Approved grading scale can close its effective interval only when superseded';
      END IF;
    END IF;

    IF OLD."status" = 'Superseded' AND (
      NEW."status" <> 'Superseded'
      OR NEW."effectiveTo" IS DISTINCT FROM OLD."effectiveTo"
      OR NEW."supersededAt" IS DISTINCT FROM OLD."supersededAt"
    ) THEN
      RAISE EXCEPTION 'Superseded grading-scale versions are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeGradingScaleVersion_protect_immutable"
BEFORE UPDATE OR DELETE ON "ProgrammeGradingScaleVersion"
FOR EACH ROW
EXECUTE FUNCTION "protect_immutable_programme_grading_scale_version"();

CREATE OR REPLACE FUNCTION "protect_programme_grading_scale_grade"()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "ProgrammeGradingScaleVersionStatus";
  parent_id TEXT;
BEGIN
  parent_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."gradingScaleVersionId"
    ELSE NEW."gradingScaleVersionId"
  END;

  SELECT "status" INTO parent_status
  FROM "ProgrammeGradingScaleVersion"
  WHERE "id" = parent_id;

  IF parent_status <> 'Draft' THEN
    RAISE EXCEPTION 'Grade rows of Approved or Superseded grading scales are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeGradingScaleGrade_protect_immutable_parent"
BEFORE INSERT OR UPDATE OR DELETE ON "ProgrammeGradingScaleGrade"
FOR EACH ROW
EXECUTE FUNCTION "protect_programme_grading_scale_grade"();

CREATE OR REPLACE FUNCTION "protect_programme_grading_scale_audit_history"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Programme grading-scale audit actions are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProgrammeGradingScaleAuditAction_append_only"
BEFORE UPDATE OR DELETE ON "ProgrammeGradingScaleAuditAction"
FOR EACH ROW
EXECUTE FUNCTION "protect_programme_grading_scale_audit_history"();

CREATE OR REPLACE FUNCTION "protect_course_spec_grading_scale_binding"()
RETURNS TRIGGER AS $$
DECLARE
  course_programme_id TEXT;
  scale_programme_id TEXT;
  scale_status "ProgrammeGradingScaleVersionStatus";
  scale_effective_from DATE;
  scale_effective_to DATE;
  selected_version_id TEXT;
BEGIN
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

  IF NEW."reviewStatus" IN ('Submitted', 'Resubmitted', 'UnderReview', 'Approved')
    AND NEW."gradingScaleVersionId" IS NULL
  THEN
    SELECT v."id" INTO selected_version_id
    FROM "ProgrammeGradingScaleVersion" v
    JOIN "ProgrammeGradingScale" s ON s."id" = v."gradingScaleId"
    WHERE s."programmeId" = course_programme_id
      AND s."isDefault" = true
      AND v."status" = 'Approved'
    ORDER BY v."version" DESC
    LIMIT 1;

    IF selected_version_id IS NULL THEN
      RAISE EXCEPTION 'CourseSpec submission requires an Approved default programme grading scale';
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

  IF NEW."reviewStatus" IN ('Submitted', 'Resubmitted', 'UnderReview', 'Approved') THEN
    IF NEW."effectiveFrom" IS NULL AND scale_status <> 'Approved' THEN
      RAISE EXCEPTION 'A CourseSpec without an effective date must use the current Approved grading scale';
    END IF;
    IF NEW."effectiveFrom" IS NOT NULL THEN
      IF scale_effective_from IS NOT NULL
        AND NEW."effectiveFrom"::date < scale_effective_from
      THEN
        RAISE EXCEPTION 'CourseSpec effective date precedes its grading-scale version';
      END IF;
      IF scale_effective_to IS NOT NULL
        AND NEW."effectiveFrom"::date >= scale_effective_to
      THEN
        RAISE EXCEPTION 'CourseSpec effective date falls after its grading-scale version was superseded';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CourseSpec_grading_scale_binding_on_insert"
BEFORE INSERT ON "CourseSpec"
FOR EACH ROW
EXECUTE FUNCTION "protect_course_spec_grading_scale_binding"();

CREATE TRIGGER "CourseSpec_grading_scale_binding_on_update"
BEFORE UPDATE OF "gradingScaleVersionId", "reviewStatus", "effectiveFrom", "basedOnVersionId", "courseId"
ON "CourseSpec"
FOR EACH ROW
EXECUTE FUNCTION "protect_course_spec_grading_scale_binding"();

DO $$
DECLARE
  table_name text;
  api_role text;
  grading_tables constant text[] := ARRAY[
    'ProgrammeGradingScale',
    'ProgrammeGradingScaleVersion',
    'ProgrammeGradingScaleGrade',
    'ProgrammeGradingScaleAuditAction'
  ];
BEGIN
  FOREACH table_name IN ARRAY grading_tables LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC', 'public', table_name);
  END LOOP;

  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    FOREACH table_name IN ARRAY grading_tables LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', 'public', table_name, api_role);
    END LOOP;
  END LOOP;
END
$$;
